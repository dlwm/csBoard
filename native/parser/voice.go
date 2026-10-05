package goparser

import (
	"encoding/binary"
	"hash/crc32"
	"strconv"

	dem "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/msg"
)

// Compressed Opus frames stay in round caches; PCM is decoded only for playback.
// 只缓存压缩语音帧，播放时解码 PCM；解析器无需 cgo 或本机音频依赖。
type VoiceFrame struct {
	Tick     float64 `json:"tick"`
	SteamID  string  `json:"steamid"`
	Name     string  `json:"name"`
	Duration float64 `json:"duration"`
	Data     []byte  `json:"data"`
}

type VoiceSummary struct {
	Frames  int  `json:"frames"`
	Skipped int  `json:"skipped"`
	Limited bool `json:"limited"`
}

func opusDuration(packet []byte) float64 {
	if len(packet) == 0 {
		return 0
	}
	config := int(packet[0] >> 3)
	var ms float64
	if config >= 16 {
		ms = 2.5 * float64(uint64(1)<<uint(config&3))
	} else if config >= 12 {
		ms = 10 * float64(uint64(1)<<uint(config&1))
	} else {
		ms = []float64{10, 20, 40, 60}[config&3]
	}
	count := 1
	switch packet[0] & 3 {
	case 1, 2:
		count = 2
	case 3:
		if len(packet) < 2 {
			return 0
		}
		count = int(packet[1] & 63)
	}
	ms *= float64(count)
	if ms <= 0 || ms > 120 {
		return 0
	}
	return ms / 1000
}

func voicePackets(audio *msg.CMsgVoiceAudio) ([][]byte, bool) {
	data := audio.GetVoiceData()
	if len(data) == 0 {
		return nil, true
	}
	if audio.GetFormat() == msg.VoiceDataFormatT_VOICEDATA_FORMAT_OPUS {
		count := int(audio.GetNumPackets())
		if count <= 1 {
			return [][]byte{data}, true
		}
		offsets := audio.GetPacketOffsets()
		if count > len(offsets) {
			return nil, false
		}
		// Source 2 stores cumulative packet ends, often in a padded four-entry
		// array. num_packets defines the meaningful entries, not array length.
		// packet_offsets 是包结束偏移；数组可有零填充，按 num_packets 读取。
		packets := [][]byte{}
		start := 0
		for _, offset := range offsets[:count] {
			end := int(offset)
			if end <= start || end > len(data) {
				return nil, false
			}
			packets = append(packets, data[start:end])
			start = end
		}
		return packets, start == len(data)
	}
	if audio.GetFormat() != msg.VoiceDataFormatT_VOICEDATA_FORMAT_STEAM || len(data) < 12 {
		return nil, false
	}
	end := len(data) - 4
	if crc32.ChecksumIEEE(data[:end]) != binary.LittleEndian.Uint32(data[end:]) {
		return nil, false
	}
	packets := [][]byte{}
	for offset := 8; offset < end; {
		typeID := data[offset]
		offset++
		if offset+2 > end {
			return nil, false
		}
		length := int(binary.LittleEndian.Uint16(data[offset:]))
		offset += 2
		if typeID == 11 || typeID == 0 {
			continue
		} // sample rate / silence frame count
		if typeID != 6 || offset+length > end {
			return nil, false
		}
		payload := data[offset : offset+length]
		offset += length
		for index := 0; index < len(payload); {
			if index+2 > len(payload) {
				return nil, false
			}
			size := int(binary.LittleEndian.Uint16(payload[index:]))
			index += 2
			if size == 65535 {
				break
			} // end/reset marker
			if index+2+size > len(payload) {
				return nil, false
			}
			index += 2 // sequence number; timeline is carried by Demo tick
			if size > 0 {
				packets = append(packets, payload[index:index+size])
			}
			index += size
		}
	}
	return packets, true
}

func trackVoice(parser dem.Parser, report *Report) {
	bytes := 0
	type streamClock struct {
		section uint32
		offset  uint32
		anchor  float64
		next    float64
		sampled bool
	}
	clocks := map[string]streamClock{}
	parser.RegisterNetMessageHandler(func(message *msg.CSVCMsg_VoiceData) {
		if message.Audio == nil || len(message.Audio.GetVoiceData()) == 0 {
			return
		}
		packets, valid := voicePackets(message.Audio)
		if !valid {
			report.VoiceSummary.Skipped++
			return
		}
		id := message.GetXuid()
		if id == 0 && message.Audio.GetFormat() == msg.VoiceDataFormatT_VOICEDATA_FORMAT_STEAM {
			id = binary.LittleEndian.Uint64(message.Audio.GetVoiceData()[:8])
		}
		name := ""
		for _, player := range parser.GameState().Participants().All() {
			if (id != 0 && player.SteamID64 == id) || (id == 0 && player.EntityID == int(message.GetEntity())) {
				id = player.SteamID64
				name = player.Name
				break
			}
		}
		if id == 0 && name == "" {
			report.VoiceSummary.Skipped++
			return
		}
		tick := float64(parser.GameState().IngameTick())
		if tick < 0 {
			return
		}
		speaker := strconv.FormatUint(id, 10)
		if id == 0 {
			speaker = name
		}
		clock, exists := clocks[speaker]
		audio := message.Audio
		sampled := audio.UncompressedSampleOffset != nil && audio.SectionNumber != nil
		if sampled {
			rate := float64(audio.GetSampleRate())
			if rate == 0 {
				rate = 48000
			}
			if !exists || !clock.sampled || clock.section != audio.GetSectionNumber() || audio.GetUncompressedSampleOffset() < clock.offset {
				clock = streamClock{section: audio.GetSectionNumber(), offset: audio.GetUncompressedSampleOffset(), anchor: tick, sampled: true}
			}
			// Sample offsets prevent same-tick messages from playing over each other.
			// 采样偏移保证同 tick 的多个语音包连续播放而非叠音。
			tick = clock.anchor + float64(audio.GetUncompressedSampleOffset()-clock.offset)/rate*64
		} else if exists && tick < clock.next && clock.next-tick < 64*0.25 {
			tick = clock.next
		}
		for _, packet := range packets {
			duration := opusDuration(packet)
			if duration == 0 {
				report.VoiceSummary.Skipped++
				continue
			}
			if bytes+len(packet) > 64*1024*1024 {
				report.VoiceSummary.Limited = true
				return
			}
			bytes += len(packet)
			report.VoiceFrames = append(report.VoiceFrames, VoiceFrame{Tick: tick, SteamID: strconv.FormatUint(id, 10), Name: name, Duration: duration, Data: append([]byte(nil), packet...)})
			report.VoiceSummary.Frames++
			tick += duration * 64
		}
		clock.next = tick
		clocks[speaker] = clock
	})
}
