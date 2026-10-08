package goparser

import (
	"encoding/binary"
	"errors"
	"reflect"
	"testing"
)

func TestSourceLengthValidation(t *testing.T) {
	header := make([]byte, 12)
	copy(header, "PBDEMS2\x00")
	binary.LittleEndian.PutUint32(header[8:], 1000)
	if err := ValidateSource(header, 1018); err != nil {
		t.Fatal(err)
	}
	for _, size := range []int64{999, 1000, 12} {
		if ValidateSource(header, size) == nil {
			t.Fatalf("accepted size %d", size)
		}
	}
	if ValidateSource(header[:8], 1018) == nil {
		t.Fatal("accepted incomplete header")
	}
	header[0] = 'X'
	if ValidateSource(header, 1018) == nil {
		t.Fatal("accepted wrong magic")
	}
}

func TestPreparedQueriesAndRelease(t *testing.T) {
	readError := errors.New("source changed")
	reads := 0
	session := NewSession(1, func(int) ([]byte, error) { reads++; return nil, readError })
	session.parts[0].ticks = map[int][]preparedTickRow{
		10: {{name: "one", steamID: "76561198000000001", values: []any{1, 100}}, {name: "two", steamID: "76561198000000002", values: []any{2, 50}}},
		20: {},
	}
	session.parts[0].props = map[string]int{"X": 0, "health": 1}
	query := Query{Ticks: []int{20, 10, 10}, Props: []string{"X"}, Players: []string{"76561198000000002"}}
	result, err := session.Request("ticks", query)
	if err != nil {
		t.Fatal(err)
	}
	expected := []map[string]any{{"tick": 10, "name": "two", "steamid": "76561198000000002", "X": 2}}
	if !reflect.DeepEqual(result, expected) {
		t.Fatalf("wrong filtered result: %#v", result)
	}
	result.([]map[string]any)[0]["X"] = 999
	again, err := session.Request("ticks", query)
	if err != nil || !reflect.DeepEqual(again, expected) {
		t.Fatal("query mutated prepared rows")
	}
	if _, err := session.Request("ticks", Query{Ticks: []int{11}}); err == nil {
		t.Fatal("unprepared tick was accepted")
	}
	if _, err := session.Request("ticks", Query{Ticks: []int{10}, Props: []string{"Y"}}); err == nil {
		t.Fatal("unprepared property was accepted")
	}
	if _, err := session.Request("ticks", Query{Part: 1}); err == nil {
		t.Fatal("invalid part was accepted")
	}
	if _, err := session.Request("prepareTicks", query); !errors.Is(err, readError) {
		t.Fatal("source error was hidden")
	}
	if reads != 1 {
		t.Fatalf("prepared queries read source %d times", reads)
	}
	if _, err := session.Request("ticks", query); err != nil {
		t.Fatal("failed preparation destroyed previous rows")
	}
	if _, err := session.Request("releaseTicks", Query{}); err != nil {
		t.Fatal(err)
	}
	if _, err := session.Request("ticks", query); !errors.Is(err, readError) {
		t.Fatal("release retained prepared data")
	}
}
