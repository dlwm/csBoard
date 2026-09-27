use parser::first_pass::parser_settings::{rm_user_friendly_names, FirstPassParser, ParserInputs};
use parser::parse_demo::{Parser, ParsingMode};
use parser::second_pass::parser_settings::create_huffman_lookup_table;
use parser::second_pass::variants::{soa_to_aos, OutputSerdeHelperStruct};
use serde_json::{json, Value};
use std::{collections::HashMap, fs};

pub struct DemoParser {
    sources: Vec<Vec<u8>>,
    huffman: Vec<(u8, u8)>,
    pool: Option<rayon::ThreadPool>,
    parallel_ticks: bool,
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|v| {
            v.iter()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

impl DemoParser {
    pub fn new() -> Self {
        Self {
            sources: Vec::new(),
            huffman: create_huffman_lookup_table(),
            pool: None,
            parallel_ticks: false,
        }
    }

    pub fn call(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        if method == "configure" {
            if !self.sources.is_empty() { return Err("Configure parser before loading sources".into()); }
            let threads = args["threads"].as_u64().filter(|n| (1..=128).contains(n)).ok_or("Invalid thread budget")? as usize;
            self.pool = Some(rayon::ThreadPoolBuilder::new().num_threads(threads).build().map_err(|e| e.to_string())?);
            self.parallel_ticks = args["parallelTicks"].as_bool().unwrap_or(true);
            return Ok(json!({"threads":threads,"parallelTicks":self.parallel_ticks}));
        }
        if method == "source" {
            let mut sources = Vec::new();
            let mut descriptors = Vec::new();
            for path in strings(&args["paths"]) {
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                if bytes.len() < 16 || &bytes[..8] != b"PBDEMS2\0" {
                    return Err("Invalid Source 2 demo header".into());
                }
                let expected = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize + 18;
                if expected != bytes.len() {
                    return Err(format!(
                        "Demo length mismatch: expected {expected}, got {}",
                        bytes.len()
                    ));
                }
                descriptors.push(json!({ "byteLength": bytes.len(), "part": sources.len() }));
                sources.push(bytes);
            }
            if sources.is_empty() {
                return Err("No demo files selected".into());
            }
            self.sources = sources;
            return Ok(json!(descriptors));
        }
        let part = args["part"].as_u64().ok_or("Missing source part")? as usize;
        let bytes = self.sources.get(part).ok_or("Unknown source part")?;
        let props = strings(&args["props"]);
        let real_names = rm_user_friendly_names(&props).map_err(|e| e.to_string())?;
        // User-command button state can cross full-packet boundaries (Nuke regression).
        let stateful_buttons = real_names.iter().any(|name| parser::maps::BUTTONMAP.contains_key(name.as_str()) || name.contains("Button"));
        let names: HashMap<_, _> = real_names.iter().cloned().zip(props).collect();
        let settings = ParserInputs {
            wanted_players: strings(&args["players"])
                .iter()
                .map(|v| v.parse::<u64>().unwrap_or(0))
                .collect(),
            wanted_player_props: real_names,
            wanted_other_props: vec![],
            real_name_to_og_name: names.into_iter().collect(),
            wanted_events: if method == "events" {
                strings(&args["events"])
            } else {
                vec![]
            },
            parse_ents: method != "header",
            wanted_ticks: args["ticks"]
                .as_array()
                .map(|v| {
                    v.iter()
                        .filter_map(|n| n.as_i64().and_then(|n| i32::try_from(n).ok()))
                        .collect()
                })
                .unwrap_or_default(),
            parse_projectiles: method == "grenades",
            only_header: method == "header",
            list_props: false,
            only_convars: false,
            huffman_lookup_table: &self.huffman,
            order_by_steamid: false,
            wanted_prop_states: Default::default(),
            fallback_bytes: None,
            parse_grenades: method == "grenades",
        };
        if method == "header" {
            let output = FirstPassParser::new(&settings)
                .parse_header_only(bytes)
                .map_err(|e| e.to_string())?;
            return serde_json::to_value(output.into_iter().collect::<HashMap<_, _>>())
                .map_err(|e| e.to_string());
        }
        if !["events", "ticks", "grenades"].contains(&method) {
            return Err("Unknown parser operation".into());
        }
        // Events and stateful smoke/inferno journals keep their sequential semantics.
        // Normal also checks the upstream list of properties unsafe to split.
        let mode = if self.parallel_ticks && method == "ticks" && !stateful_buttons { ParsingMode::Normal } else { ParsingMode::ForceSingleThreaded };
        let parse = || Parser::new(settings, mode).parse_demo(bytes).map_err(|e| e.to_string());
        let output = if let Some(pool) = &self.pool { pool.install(parse) } else { parse() }?;
        if method == "events" {
            return serde_json::to_value(output.game_events).map_err(|e| e.to_string());
        }
        let mut props = output.prop_controller.prop_infos;
        props.sort_by_key(|p| p.prop_name.clone());
        serde_json::to_value(soa_to_aos(OutputSerdeHelperStruct {
            prop_infos: props,
            inner: output.df.into(),
        }))
        .map_err(|e| e.to_string())
    }
}
