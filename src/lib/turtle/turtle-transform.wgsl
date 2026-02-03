// Turtle Transform Shader
// Computes cumulative angle and generates line segments

struct Params {
    count: u32,
    angle_rad: f32,  // Turn angle in radians
    step_size: f32,
    _pad: u32,
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
@group(0) @binding(2) var<storage, read> bracket_depth: array<i32>;
@group(0) @binding(3) var<storage, read> bracket_match: array<i32>;
@group(0) @binding(4) var<storage, read_write> angle_deltas: array<f32>;
@group(0) @binding(5) var<storage, read_write> cumulative_angles: array<f32>;
@group(0) @binding(6) var<storage, read_write> positions_x: array<f32>;
@group(0) @binding(7) var<storage, read_write> positions_y: array<f32>;
@group(0) @binding(8) var<storage, read_write> segments: array<Segment>;
@group(0) @binding(9) var<storage, read_write> segment_count: atomic<u32>;

const PI: f32 = 3.14159265359;

// Compute angle delta for each symbol
@compute @workgroup_size(256)
fn compute_angle_deltas(
    @builtin(global_invocation_id) global_id: vec3u,
) {
    let idx = global_id.x;
    if (idx >= params.count) {
        return;
    }
    
    let sym = symbols[idx];
    var delta: f32 = 0.0;
    
    if (sym == 43u) {  // '+'
        delta = params.angle_rad;
    } else if (sym == 45u) {  // '-'
        delta = -params.angle_rad;
    } else if (sym == 124u) {  // '|'
        delta = PI;
    }
    
    angle_deltas[idx] = delta;
}

// Simple scan for cumulative angles (workgroup local)
var<workgroup> shared_angles: array<f32, 512>;

@compute @workgroup_size(256)
fn scan_angles(
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) wg_id: vec3u,
) {
    let tid = local_id.x;
    let gid = global_id.x;
    let block_offset = wg_id.x * 512u;
    
    // Load
    let ai = tid;
    let bi = tid + 256u;
    shared_angles[ai] = select(0.0, angle_deltas[block_offset + ai], block_offset + ai < params.count);
    shared_angles[bi] = select(0.0, angle_deltas[block_offset + bi], block_offset + bi < params.count);
    
    // Up-sweep
    var offset = 1u;
    for (var d = 256u; d > 0u; d >>= 1u) {
        workgroupBarrier();
        if (tid < d) {
            let ai_idx = offset * (2u * tid + 1u) - 1u;
            let bi_idx = offset * (2u * tid + 2u) - 1u;
            shared_angles[bi_idx] += shared_angles[ai_idx];
        }
        offset *= 2u;
    }
    
    if (tid == 0u) {
        shared_angles[511u] = 0.0;
    }
    
    // Down-sweep
    for (var d = 1u; d < 512u; d *= 2u) {
        offset >>= 1u;
        workgroupBarrier();
        if (tid < d) {
            let ai_idx = offset * (2u * tid + 1u) - 1u;
            let bi_idx = offset * (2u * tid + 2u) - 1u;
            let t = shared_angles[ai_idx];
            shared_angles[ai_idx] = shared_angles[bi_idx];
            shared_angles[bi_idx] += t;
        }
    }
    
    workgroupBarrier();
    
    // Write - add initial angle offset (PI/2 = pointing up)
    let initial_angle = PI / 2.0;
    if (block_offset + ai < params.count) {
        cumulative_angles[block_offset + ai] = shared_angles[ai] + initial_angle;
    }
    if (block_offset + bi < params.count) {
        cumulative_angles[block_offset + bi] = shared_angles[bi] + initial_angle;
    }
}

// Generate line segments for drawing symbols
// This pass handles brackets by using a sequential approach per workgroup
@compute @workgroup_size(1)
fn generate_segments_serial() {
    var x: f32 = 0.0;
    var y: f32 = 0.0;
    var angle: f32 = PI / 2.0;  // Start pointing up
    
    // Stack for bracket state
    var stack_x: array<f32, 256>;
    var stack_y: array<f32, 256>;
    var stack_angle: array<f32, 256>;
    var stack_depth: array<u32, 256>;
    var top: u32 = 0u;
    var depth: u32 = 0u;
    
    for (var i: u32 = 0u; i < params.count; i++) {
        let sym = symbols[i];
        
        if (sym == 70u || sym == 71u) {  // 'F' or 'G'
            let new_x = x + cos(angle) * params.step_size;
            let new_y = y + sin(angle) * params.step_size;
            
            // Add segment
            let seg_idx = atomicAdd(&segment_count, 1u);
            segments[seg_idx].start_x = x;
            segments[seg_idx].start_y = y;
            segments[seg_idx].end_x = new_x;
            segments[seg_idx].end_y = new_y;
            segments[seg_idx].depth = depth;
            
            // Color based on depth (HSL to RGB)
            let hue = f32(depth * 60u % 360u);
            let c = 0.7 * (1.0 - abs(2.0 * 0.5 - 1.0));
            let h_prime = hue / 60.0;
            let x_col = c * (1.0 - abs(h_prime % 2.0 - 1.0));
            let m = 0.5 - c / 2.0;
            
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
            
            x = new_x;
            y = new_y;
        } else if (sym == 102u || sym == 103u) {  // 'f' or 'g'
            x = x + cos(angle) * params.step_size;
            y = y + sin(angle) * params.step_size;
        } else if (sym == 43u) {  // '+'
            angle += params.angle_rad;
        } else if (sym == 45u) {  // '-'
            angle -= params.angle_rad;
        } else if (sym == 124u) {  // '|'
            angle += PI;
        } else if (sym == 91u) {  // '['
            stack_x[top] = x;
            stack_y[top] = y;
            stack_angle[top] = angle;
            stack_depth[top] = depth;
            top++;
            depth++;
        } else if (sym == 93u) {  // ']'
            if (top > 0u) {
                top--;
                x = stack_x[top];
                y = stack_y[top];
                angle = stack_angle[top];
                depth = stack_depth[top];
            }
        }
    }
}
