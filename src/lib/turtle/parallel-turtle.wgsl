// Parallel Turtle Interpreter
// Processes L-system symbols to line segments in parallel
// Key insight: bracket depth is bounded, so we process level-by-level

struct Params {
    symbol_count: u32,
    angle_rad: f32,
    step_size: f32,
    max_depth: u32,
}

struct TurtleState {
    x: f32,
    y: f32,
    angle: f32,
    depth: u32,
}

struct Segment {
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
    depth: u32,
    color_r: f32,
    color_g: f32,
    color_b: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> symbols: array<u32>;
@group(0) @binding(2) var<storage, read_write> bracket_depth: array<u32>;
@group(0) @binding(3) var<storage, read_write> bracket_open_idx: array<i32>;  // Index of opening bracket for each position
@group(0) @binding(4) var<storage, read_write> angle_at: array<f32>;          // Cumulative angle at each position
@group(0) @binding(5) var<storage, read_write> pos_x: array<f32>;
@group(0) @binding(6) var<storage, read_write> pos_y: array<f32>;
@group(0) @binding(7) var<storage, read_write> segments: array<Segment>;
@group(0) @binding(8) var<storage, read_write> segment_count: atomic<u32>;
@group(0) @binding(9) var<storage, read_write> is_draw_cmd: array<u32>;       // 1 if this is F/G, 0 otherwise

const PI: f32 = 3.14159265359;

// Pass 1: Compute bracket depth for each symbol
@compute @workgroup_size(256)
fn compute_bracket_depth(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    let sym = symbols[idx];
    
    // Mark depth change: [ = +1, ] = -1
    if (sym == 91u) {  // '['
        bracket_depth[idx] = 1u;
    } else if (sym == 93u) {  // ']'
        bracket_depth[idx] = 0xFFFFFFFFu;  // Will be treated as -1 in signed
    } else {
        bracket_depth[idx] = 0u;
    }
    
    // Mark draw commands
    is_draw_cmd[idx] = select(0u, 1u, sym == 70u || sym == 71u);  // F or G
}

// Pass 2: Prefix sum on bracket_depth to get actual depth (done on CPU for simplicity)
// After this pass, bracket_depth[i] contains the depth AT position i

// Pass 3: For each position, find the index of its opening bracket
// This is done by scanning backwards - can be parallelized per depth level
@compute @workgroup_size(256)
fn find_bracket_opens(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    let sym = symbols[idx];
    let depth = bracket_depth[idx];
    
    if (sym == 91u) {  // '[' - opening bracket
        bracket_open_idx[idx] = i32(idx);  // Points to itself
    } else if (depth == 0u) {
        bracket_open_idx[idx] = -1;  // No enclosing bracket
    } else {
        // Find the opening bracket by scanning backwards
        // This is O(n) in worst case but usually short due to locality
        var open_idx: i32 = -1;
        var search_depth = depth;
        for (var i: i32 = i32(idx) - 1; i >= 0; i--) {
            let s = symbols[u32(i)];
            if (s == 91u && bracket_depth[u32(i)] == depth) {
                open_idx = i;
                break;
            }
        }
        bracket_open_idx[idx] = open_idx;
    }
}

// Pass 4: Compute angle at each position using prefix sum within bracket scopes
@compute @workgroup_size(256)
fn compute_angles(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    let sym = symbols[idx];
    
    // Compute local angle delta
    var angle_delta: f32 = 0.0;
    if (sym == 43u) { angle_delta = params.angle_rad; }      // '+'
    else if (sym == 45u) { angle_delta = -params.angle_rad; } // '-'
    else if (sym == 124u) { angle_delta = PI; }              // '|'
    
    // For now, store the delta - will accumulate in next pass
    angle_at[idx] = angle_delta;
}

// Pass 5: Accumulate angles - prefix sum within each bracket scope
// This is the key parallel operation
// For each symbol, sum all angle deltas from the start of its scope to this position
@compute @workgroup_size(256)  
fn accumulate_angles(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    let open_idx = bracket_open_idx[idx];
    let start_idx = select(0u, u32(open_idx) + 1u, open_idx >= 0);
    
    // Sum angles from start of scope to this position
    var total_angle: f32 = PI / 2.0;  // Initial angle (pointing up)
    
    // Add angles from all ancestor scopes
    if (open_idx >= 0) {
        total_angle = angle_at[u32(open_idx)];  // Parent's accumulated angle
    }
    
    // Add angles within this scope
    for (var i: u32 = start_idx; i < idx; i++) {
        let d = bracket_depth[i];
        let my_d = bracket_depth[idx];
        // Only count if same scope (same depth and same parent)
        if (d == my_d || symbols[i] == 91u || symbols[i] == 93u) {
            continue;
        }
        let s = symbols[i];
        if (s == 43u) { total_angle += params.angle_rad; }
        else if (s == 45u) { total_angle -= params.angle_rad; }
        else if (s == 124u) { total_angle += PI; }
    }
    
    angle_at[idx] = total_angle;
}

// Pass 6: Compute positions for each draw command
@compute @workgroup_size(256)
fn compute_positions(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    if (is_draw_cmd[idx] == 0u) { return; }
    
    let angle = angle_at[idx];
    
    // Find starting position by tracing back to scope start
    let open_idx = bracket_open_idx[idx];
    var x: f32 = 0.0;
    var y: f32 = 0.0;
    
    if (open_idx >= 0) {
        x = pos_x[u32(open_idx)];
        y = pos_y[u32(open_idx)];
    }
    
    // Accumulate position within scope
    let start_idx = select(0u, u32(open_idx) + 1u, open_idx >= 0);
    for (var i: u32 = start_idx; i < idx; i++) {
        let s = symbols[i];
        if (s == 70u || s == 71u) {  // F or G
            let a = angle_at[i];
            x += cos(a) * params.step_size;
            y += sin(a) * params.step_size;
        } else if (s == 102u || s == 103u) {  // f or g
            let a = angle_at[i];
            x += cos(a) * params.step_size;
            y += sin(a) * params.step_size;
        }
    }
    
    pos_x[idx] = x;
    pos_y[idx] = y;
}

// Pass 7: Generate segments from draw commands
@compute @workgroup_size(256)
fn generate_segments(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= params.symbol_count) { return; }
    
    if (is_draw_cmd[idx] == 0u) { return; }
    
    let x = pos_x[idx];
    let y = pos_y[idx];
    let angle = angle_at[idx];
    let depth = bracket_depth[idx];
    
    let end_x = x + cos(angle) * params.step_size;
    let end_y = y + sin(angle) * params.step_size;
    
    // Allocate segment
    let seg_idx = atomicAdd(&segment_count, 1u);
    
    segments[seg_idx].start_x = x;
    segments[seg_idx].start_y = y;
    segments[seg_idx].end_x = end_x;
    segments[seg_idx].end_y = end_y;
    segments[seg_idx].depth = depth;
    
    // Color based on depth
    let hue = f32(depth * 60u % 360u);
    let c = 0.7;
    let x_col = c * (1.0 - abs((hue / 60.0) % 2.0 - 1.0));
    let m: f32 = 0.15;
    
    var r: f32; var g: f32; var b: f32;
    if (hue < 60.0) { r = c; g = x_col; b = 0.0; }
    else if (hue < 120.0) { r = x_col; g = c; b = 0.0; }
    else if (hue < 180.0) { r = 0.0; g = c; b = x_col; }
    else if (hue < 240.0) { r = 0.0; g = x_col; b = c; }
    else if (hue < 300.0) { r = x_col; g = 0.0; b = c; }
    else { r = c; g = 0.0; b = x_col; }
    
    segments[seg_idx].color_r = r + m;
    segments[seg_idx].color_g = g + m;
    segments[seg_idx].color_b = b + m;
}
