// Create a global object to hold the module exports
window.DashPlayerModule = {};

(async () => {
    try {
        // Dynamically import the module from the correct path
        const module = await import('/8i/app/lib/DashPlayer.module.js');

        // Assign the exports to the global object
        window.DashPlayerModule.DOT_WIDTH = module.o;
        window.DashPlayerModule.DashPlayer = module.p;
        window.DashPlayerModule.DashPlayerWebGLImplementation = module.q;

        console.log("DashPlayer.module.js loaded and assigned to window.DashPlayerModule");
    } catch (error) {
        console.error("Failed to import DashPlayer.module.js:", error);
    }
})();

