// Blelloch Prefix Sum (Exclusive Scan) - Workgroup Local Version
// Each workgroup processes WORKGROUP_SIZE * 2 elements
// For arrays larger than one workgroup, use multi-pass with block sums

struct Params {
    count: u32,
    pass_offset: u32,  // For multi-pass: starting index for this pass
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;
@group(0) @binding(3) var<storage, read_write> block_sums: array<u32>;

var<workgroup> shared_data: array<u32, 512>;

const WORKGROUP_SIZE: u32 = 256u;
const ELEMENTS_PER_BLOCK: u32 = 512u;

@compute @workgroup_size(256)
fn scan_blocks(
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) wg_id: vec3u,
) {
    let tid = local_id.x;
    let block_offset = wg_id.x * ELEMENTS_PER_BLOCK;
    
    // Load two elements per thread into shared memory
    let ai = tid;
    let bi = tid + WORKGROUP_SIZE;
    
    let global_ai = block_offset + ai;
    let global_bi = block_offset + bi;
    
    // Load with bounds check
    shared_data[ai] = select(0u, input[global_ai], global_ai < params.count);
    shared_data[bi] = select(0u, input[global_bi], global_bi < params.count);
    
    // Up-sweep (reduce) phase
    var offset = 1u;
    for (var d = WORKGROUP_SIZE; d > 0u; d >>= 1u) {
        workgroupBarrier();
        if (tid < d) {
            let ai_idx = offset * (2u * tid + 1u) - 1u;
            let bi_idx = offset * (2u * tid + 2u) - 1u;
            shared_data[bi_idx] += shared_data[ai_idx];
        }
        offset *= 2u;
    }
    
    // Store block sum and clear last element
    if (tid == 0u) {
        block_sums[wg_id.x] = shared_data[ELEMENTS_PER_BLOCK - 1u];
        shared_data[ELEMENTS_PER_BLOCK - 1u] = 0u;
    }
    
    // Down-sweep phase
    for (var d = 1u; d < ELEMENTS_PER_BLOCK; d *= 2u) {
        offset >>= 1u;
        workgroupBarrier();
        if (tid < d) {
            let ai_idx = offset * (2u * tid + 1u) - 1u;
            let bi_idx = offset * (2u * tid + 2u) - 1u;
            let t = shared_data[ai_idx];
            shared_data[ai_idx] = shared_data[bi_idx];
            shared_data[bi_idx] += t;
        }
    }
    
    workgroupBarrier();
    
    // Write results
    if (global_ai < params.count) {
        output[global_ai] = shared_data[ai];
    }
    if (global_bi < params.count) {
        output[global_bi] = shared_data[bi];
    }
}

// Add block sums to scanned output (second pass)
@compute @workgroup_size(256)
fn add_block_sums(
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(workgroup_id) wg_id: vec3u,
) {
    let idx = global_id.x;
    
    if (idx >= params.count) {
        return;
    }
    
    // Skip first block (no sum to add)
    if (wg_id.x == 0u) {
        return;
    }
    
    // Add the scanned block sum to this element
    output[idx] += block_sums[wg_id.x];
}
