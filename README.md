# ComfyUI 8i 3D Viewer Node

A custom node for ComfyUI that enables viewing and capturing frames from 8i volumetric videos (MPD files). This node provides an interactive 3D viewer with playback controls and frame capture capabilities.

## Features

- **MPD File Support**: Load and view 8i volumetric videos directly in ComfyUI
- **Interactive Controls**:
  - Play/Pause toggle for animation playback
  - Background color customization
  - Frame count selection for capture
- **Frame Capture**: Automatically capture multiple frames from the animation
- **Modern UI**: Clean and intuitive interface with responsive design
- **Real-time Preview**: Live preview of the volumetric content
- **Camera Controls**: Orbit, pan, and zoom controls for viewing

## Installation

1. Make sure you have ComfyUI installed and running
2. Clone this repository into your ComfyUI custom_nodes directory:
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/yourusername/comfyui-8i.git
```

3. Install the required dependencies:
```bash
cd comfyui-8i
pip install -r requirements.txt
```

4. Restart ComfyUI

## Usage

### Loading an MPD File

1. Add the "8i - 3DPlayer" node to your workflow
2. Enter the MPD URL in the input field
3. Click "Load" to initialize the viewer

### Viewer Controls

- **Background Color**: Use the color picker to change the viewer background
- **Frames**: Set the number of frames you want to capture (1-120)
- **Play/Pause**: Toggle animation playback
- **Camera**: Use mouse/touch controls to orbit, pan, and zoom:
  - Left click + drag: Orbit
  - Right click + drag: Pan
  - Scroll: Zoom

### Capturing Frames

1. Set the desired number of frames in the "Frames" input
2. Connect the node's output to your workflow
3. When you execute the workflow, the node will automatically:
   - Pause the animation
   - Capture the specified number of frames
   - Resume playback
   - Output the frames for further processing

## Technical Details

- The node uses Three.js for 3D rendering
- DashPlayer is used for MPD file playback
- Frame capture is synchronized with animation timing
- Output is provided as a sequence of images

## Node Properties

- **Input**: MPD URL
- **Output**: 
  - IMAGE: Captured frames from the animation
- **Parameters**:
  - Background Color: Hex color value
  - Frame Count: Number of frames to capture (1-120)

## Requirements

- ComfyUI (latest version)
- Modern web browser with WebGL support
- Internet connection for loading MPD files

## Known Limitations

- Maximum frame capture limit: 120 frames
- Requires WebGL 2.0 support
- MPD files must be accessible via URL

## Troubleshooting

If you encounter issues:

1. Check browser console for error messages
2. Ensure MPD URL is accessible
3. Verify WebGL support in your browser
4. Check if Three.js and DashPlayer are properly loaded

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your chosen license]

## Credits

- Built on ComfyUI platform
- Uses Three.js for 3D rendering
- Integrates 8i DashPlayer for volumetric video playback

## Support

For issues and feature requests, please use the GitHub issues page.