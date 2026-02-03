// Bracket Matching Shader
// Computes bracket depth and matches opening/closing brackets

struct Params {
    count: u32,
    angle_deg: f32,
    step_size: f32,
    _pad: u32,
}

// Symbol encoding:
// 'F' = 70, 'G' = 71, 'f' = 102, 'g' = 103
// '+' = 43, '-' = 45
// '[' = 91, ']' = 93
// '|' = 124

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> symbols: array<u32>;
@group(0) @binding(2) var<storage, read_write> bracket_depth: array<i32>;
@group(0) @binding(3) var<storage, read_write> bracket_match: array<i32>;  // -1 if not bracket, else matching index

var<workgroup> shared_stack: array<i32, 256>;
var<workgroup> stack_top: atomic<i32>;

// First pass: compute bracket depth for each symbol
@compute @workgroup_size(256)
fn compute_depth(
    @builtin(global_invocation_id) global_id: vec3u,
) {
    let idx = global_id.x;
    if (idx >= params.count) {
        return;
    }
    
    let sym = symbols[idx];
    
    // Compute depth change
    var delta: i32 = 0;
    if (sym == 91u) {  // '['
        delta = 1;
    } else if (sym == 93u) {  // ']'
        delta = -1;
    }
    
    // Store the depth change (will be prefix summed later)
    bracket_depth[idx] = delta;
    bracket_match[idx] = -1;  // Initialize as no match
}

// Second pass: prefix sum to get actual depths (done in separate pass)

// Third pass: match brackets using stack-based approach
// This is a serial pass - one workgroup processes all brackets sequentially
@compute @workgroup_size(1)
fn match_brackets() {
    var stack: array<i32, 256>;  // Local stack for bracket indices
    var top: i32 = 0;
    
    for (var i: u32 = 0u; i < params.count; i++) {
        let sym = symbols[i];
        
        if (sym == 91u) {  // '['
            // Push opening bracket index
            stack[top] = i32(i);
            top++;
        } else if (sym == 93u) {  // ']'
            // Pop and match
            if (top > 0) {
                top--;
                let open_idx = stack[top];
                bracket_match[open_idx] = i32(i);  // Opening points to closing
                bracket_match[i] = open_idx;  // Closing points to opening
            }
        }
    }
}
