// First, load the external script dynamically
await loadExternalScript('/DashPlayer-Dn48qdmH.js', 'module');

try {
    // Then, dynamically import the module
    const module = await import('/DashPlayer-Dn48qdmH.js');

    // Export the required members dynamically
    export const DOT_WIDTH = module.o;
    export const DashPlayer = module.p;
    export const DashPlayerWebGLImplementation = module.q;

    console.log("DashPlayer-Dn48qdmH.js loaded and imported successfully");
} catch (error) {
    console.error("Failed to import DashPlayer-Dn48qdmH.js:", error);
}

