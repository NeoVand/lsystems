// Compute expansion count for each symbol
// This prepares data for prefix sum

struct Params {
    input_count: u32,
    max_rules: u32,
    _pad0: u32,
    _pad1: u32,
}

struct Rule {
    predecessor_id: u32,
    successor_count: u32,
    successor_offset: u32,
    _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input_symbols: array<u32>;
@group(0) @binding(2) var<storage, read> rules: array<Rule>;
@group(0) @binding(3) var<storage, read_write> counts: array<u32>;

fn find_expansion_count(symbol_id: u32) -> u32 {
    for (var i = 0u; i < params.max_rules; i++) {
        if (rules[i].predecessor_id == symbol_id) {
            return rules[i].successor_count;
        }
        if (rules[i].predecessor_id == 0u) {
            break;
        }
    }
    return 1u; // No rule = identity (1 symbol output)
}

@compute @workgroup_size(256)
fn compute_counts(
    @builtin(global_invocation_id) global_id: vec3u,
) {
    let idx = global_id.x;
    
    if (idx >= params.input_count) {
        return;
    }
    
    let symbol_id = input_symbols[idx];
    counts[idx] = find_expansion_count(symbol_id);
}
