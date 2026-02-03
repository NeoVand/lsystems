// GPU Symbol Derivation Shader
// Expands symbols according to production rules using prefix sum offsets

struct Params {
    input_count: u32,
    max_rules: u32,
    max_successors: u32,
    _pad: u32,
}

// Simple symbol representation for D0L
// symbol_id: ASCII code of the symbol (e.g., 'F' = 70)
struct Symbol {
    id: u32,
}

// Rule: maps predecessor -> successor sequence
struct Rule {
    predecessor_id: u32,    // Symbol to match
    successor_count: u32,   // Number of successor symbols
    successor_offset: u32,  // Offset into successors array
    _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input_symbols: array<u32>;
@group(0) @binding(2) var<storage, read> prefix_sums: array<u32>;
@group(0) @binding(3) var<storage, read> rules: array<Rule>;
@group(0) @binding(4) var<storage, read> successors: array<u32>;
@group(0) @binding(5) var<storage, read_write> output_symbols: array<u32>;

// Find rule for a symbol (linear search - could optimize with hash table)
fn find_rule(symbol_id: u32) -> i32 {
    for (var i = 0u; i < params.max_rules; i++) {
        if (rules[i].predecessor_id == symbol_id) {
            return i32(i);
        }
        // End of rules marker (predecessor_id = 0)
        if (rules[i].predecessor_id == 0u) {
            break;
        }
    }
    return -1; // No rule found
}

@compute @workgroup_size(256)
fn derive(
    @builtin(global_invocation_id) global_id: vec3u,
) {
    let idx = global_id.x;
    
    if (idx >= params.input_count) {
        return;
    }
    
    let symbol_id = input_symbols[idx];
    let output_start = prefix_sums[idx];
    
    // Find matching rule
    let rule_idx = find_rule(symbol_id);
    
    if (rule_idx >= 0) {
        // Apply rule: copy successor symbols to output
        let rule = rules[u32(rule_idx)];
        for (var i = 0u; i < rule.successor_count; i++) {
            output_symbols[output_start + i] = successors[rule.successor_offset + i];
        }
    } else {
        // No rule: identity transformation (copy symbol)
        output_symbols[output_start] = symbol_id;
    }
}
