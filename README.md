# ComfyUI-8iPlayer

A custom node for ComfyUI that provides an interactive 3D viewer for 8i volumetric videos (MPD format), allowing frame capture, environment customization, and integration into ComfyUI workflows.

**(placeholder: Add a GIF or screenshot here showing the node in action)**

## Key Features

*   **Interactive 8i MPD Viewer:** Load and view 8i volumetric videos directly within ComfyUI using a URL.
*   **Frame Sequence Capture:** Capture a specified number of frames distributed throughout the video's duration.
*   **Playback Controls:** Basic play/pause functionality.
*   **Customizable Background:** Set a solid background color or load an HDR environment map via URL for realistic lighting.
*   **Toggleable Floor:** Add an optional ground plane with adjustable color.
*   **Toggleable Shadows:** Enable/disable shadows cast by the hologram onto the floor (requires floor).
*   **Integrated Workflow Triggering:** Camera movements automatically mark the node for re-execution in the next queue run.
*   **Outputs:** Provides captured frames as an `IMAGE` batch for further processing in ComfyUI.

## Installation

1.  Navigate to your ComfyUI `custom_nodes` directory:
    ```bash
    cd ComfyUI/custom_nodes/
    ```
2.  Clone this repository (from its new location under Kartel.IAI):
    ```bash
    git clone https://github.com/Kartel-IAI/ComfyUI-8iPlayer.git ComfyUI-8iPlayer
    ```
3.  Install the required Python dependencies:
    ```bash
    cd ComfyUI-8iPlayer
    pip install -r requirements.txt
    ```
4.  Restart ComfyUI.

## Dependencies

*   Python requirements are listed in `requirements.txt`.
*   Requires a modern web browser with WebGL support.

## How to Use

1.  Add the **"8i - 3Dplayer"** node to your workflow.
2.  Paste the URL of the 8i `.mpd` manifest into the text input field at the top of the node's panel.
3.  Click the "Load MPD" button. The 3D viewer should initialize and display the hologram.
4.  Use the controls within the viewer panel:
    *   **Background Color Picker:** Change the solid background color.
    *   **HDR URL Input & Load Button:** Enter a URL to an `.hdr` file and click "Load URL" to set it as the environment map and background (ensure URL is CORS-accessible or use `https://` prefix if needed).
    *   **Toggle Floor Button:** Show/hide a ground plane beneath the hologram.
    *   **Floor Color Picker:** Change the color of the floor when visible.
    *   **Toggle Shadows Button:** Enable/disable shadows cast by the hologram onto the floor.
    *   **Play/Pause Button:** Control animation playback.
    *   **Camera Controls:** Use your mouse (Left-drag: Orbit, Right-drag: Pan, Scroll: Zoom) to adjust the view.
5.  Set the desired number of frames to capture using the **`frame_count`** input on the ComfyUI node itself.
6.  Connect the `IMAGE` output of the "8i - 3Dplayer" node to the next node in your workflow (e.g., VAE Encode, Image Processing node).
7.  Modify the camera view as desired.
8.  Queue the prompt (Run). The node will:
    *   Pause playback (if playing).
    *   Iterate through the specified number of points in the animation timeline.
    *   Force-render and capture each frame.
    *   Resume playback.
    *   Output the captured frames as a batch.

## Node Details

**Node: `8i - 3Dplayer` (`3DImage`)**

*   **Inputs:**
    *   `frame_count` (INT): The number of frames to capture from the animation (Default: 24, Min: 1, Max: 120).
    *   `upload` (Internal THREED): Handles data transfer from the web UI (MPD URL, viewer state).
    *   `_camera_timestamp` (Internal NUMBER): Visible but disabled widget used to trigger re-execution on camera change.
*   **Outputs:**
    *   `IMAGE` (IMAGE Batch): The sequence of captured frames.

## Example Workflows

**(Note: Links/images to be added)**

Here are some examples demonstrating how to use the 8i Player node:

**1. Basic Capture & Preview:**
   *   Loads an MPD, captures frames, and displays them using a PreviewImage node.
   *   **(Workflow JSON/Image Placeholder)**

**2. Flux Realistic Rendering:**
   *   Takes the captured frames from the 8i Player and uses the Flux model (potentially with techniques like LoRA) to enhance realism.
   *   **(Workflow JSON/Image Placeholder)**

**3. Wan 14B Video Creation Example:**
   *   Demonstrates using the captured frames with the Wan 14B model as a starting point for simplified video generation tasks.
   *   **(Workflow JSON/Image Placeholder)**

## Troubleshooting

*   **Hologram Playback Issues:** If the hologram doesn't play correctly or seems stuck after loading, try clicking the "Load MPD" button again to force a reload of the animation.
*   **HDR URL Fails:** Ensure the URL is correct and publicly accessible (check for CORS issues if hosting the HDR yourself). Try prefixing with `https://` if needed.
*   **MPD Load Fails:** Verify the MPD URL is correct and accessible. Check the browser console (F12) for specific error messages.
*   **Viewer Appears Black:** Could be an issue loading the MPD or HDR. Check the console. Ensure WebGL is enabled and working in your browser.
*   **Performance:** Capturing many frames or using high-resolution HDRs can be demanding. Shadow rendering also impacts performance.
*   **Future Improvements:** Camera controls and interaction may be further refined in future updates.

## Technical Details

*   Frontend viewer built with **Three.js**.
*   MPD playback handled by **8i DashPlayer** library.
*   **OrbitControls** for camera interaction.
*   **RGBELoader** for HDR environment map loading.
*   Frame capture sequence is handled client-side via JavaScript.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Author

This project was originally created by **LOVIS ODIN**.

## License

[MIT License](LICENSE)

## Acknowledgements

*   Built for the **ComfyUI** platform.
*   Utilizes **Three.js** (MIT License).
*   Integrates **8i DashPlayer** technology.
*   **RGBELoader** based on original Three.js examples.
*   The web viewer interface and workflow-to-app concepts draw inspiration from and build upon the excellent work in [**comfyui-mixlab-nodes**](https://github.com/shadowcz007/comfyui-mixlab-nodes) by shadowcz007.

## Support

Please report issues via the GitHub Issues page for this repository.