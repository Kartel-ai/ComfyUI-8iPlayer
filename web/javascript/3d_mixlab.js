// ------------------------------
// DASH PLAYER / THREE.JS HOLOGRAM SETUP
// ------------------------------
import { app } from '../../../scripts/app.js'
import { api } from '../../../scripts/api.js'
import { $el } from '../../../scripts/ui.js'
import * as THREE from './three.module.js'
import { OrbitControls } from './OrbitControls.js'
import { RoomEnvironment } from './RoomEnvironment.js'
import { loadExternalScript, get_position_style } from './common.js'

// Set THREE globally
window.THREE = THREE;
console.log("Set THREE globally: Success");

function setCameraOrbit (modelview, distant, angles, screenNumber) {
  const angle = angles[screenNumber]
  let co = modelview.cameraOrbit.split(" ")
  if (angle !== undefined) {
    modelview.cameraOrbit = `${angle}deg ${co[1]} ${distant}m`
    console.log(screenNumber, angle)
  } else {
    console.error('Invalid screen number')
  }
}

const getLocalData = key => {
  let data = {}
  try {
    data = JSON.parse(localStorage.getItem(key)) || {}
  } catch (error) {
    return {}
  }
  return data
}

function getContentTypeFromBase64 (base64Data) {
  const regex = /^data:(.+);base64,/
  const matches = base64Data.match(regex)
  if (matches && matches.length >= 2) {
    return matches[1]
  }
  return null
}

function base64ToBlobFromURL (base64URL, contentType) {
  return fetch(base64URL).then(response => response.blob())
}

const setLocalDataOfWin = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value))
}

async function uploadImage_ (blob, fileType = '.png', filename) {
  const body = new FormData()
  body.append(
    'image',
    new File([blob], (filename || new Date().getTime()) + fileType)
  )

  const resp = await api.fetchApi('/upload/image', {
    method: 'POST',
    body
  })

  let data = await resp.json()
  return data
}

async function uploadImage (blob, fileType = '.png', filename) {
  let data = await uploadImage_(blob, fileType, filename)
  let { name, subfolder } = data
  let src = api.apiURL(
    `/view?filename=${encodeURIComponent(
      name
    )}&type=input&subfolder=${subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`
  )
  return src
}

function createImage (url) {
  let im = new Image()
  return new Promise((res, rej) => {
    im.onload = () => res(im)
    im.src = url
  })
}

const parseImage = url => {
  return new Promise((res, rej) => {
    fetch(url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64data = reader.result
          res(base64data)
        }
        reader.readAsDataURL(blob)
      })
      .catch(error => {
        console.log('Error:', error)
      })
  })
}

// ------------------------------
// NEW DASH PLAYER–BASED HOLOGRAM LOADER
// ------------------------------
async function load8iHologram(scene, renderer, camera, mpdUrl, opts = {}) {
  // Create a new DashPlayer instance with its WebGL implementation.
  const player = new window.DashPlayer(
    renderer,
    new window.DashPlayerWebGLImplementation()
  );
  
  // Create OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2;
  
  // Start the appropriate render loop.
  if (player.deviceCapabilities && player.deviceCapabilities.requestVideoFrameCallback) {
    player.attachVideoFrameCallback();
  } else {
    player.startRenderLoop();
  }
  
  // Load the manifest (mpdUrl) and add the resulting mesh to the scene.
  try {
    await player.loadManifest(mpdUrl);
    const mesh = player.mesh;
    const MESH_SCALE = 1.0;
    mesh.scale.set(MESH_SCALE * 0.01, MESH_SCALE * 0.01, MESH_SCALE * 0.01);
    mesh.position.y -= MESH_SCALE * 0.75;
    scene.add(mesh);
  } catch (error) {
    console.error("Failed to load manifest:", error);
  }
  
  // Create an object mimicking the original hologram interface.
  let _oncanplay;
  const hologram = {
    get oncanplay() { return _oncanplay; },
    set oncanplay(callback) { 
      _oncanplay = callback;
      if (player.mesh) {
        callback();
      }
    },
    player: player,
    mesh: player.mesh,
    update: function(timestamp) {
      // Update controls
      controls.update();
    },
    play: function() {
      player.play();
    },
    dispose: function() {
      // Dispose of controls and player
      controls.dispose();
      if (player.dispose) {
        player.dispose();
      }
    }
  };
  return hologram;
}

// ------------------------------
// UI and Widget Registration (unchanged)
// ------------------------------
app.registerExtension({
  name: '8i.3D.3DImage',
  async getCustomWidgets (app) {
    return {
      THREED (node, inputName, inputData, app) {
        const widget = {
          type: inputData[0], 
          name: inputName, 
          size: [128, 88], 
          draw (ctx, node, width, y) {},
          computeSize (...args) {
            return [128, 88] 
          },
          async serializeValue (nodeId, widgetIndex) {
            let d = getLocalData('8i_3d_data')
            if (d && d[node.id]) {
              let { bgColor, mpdUrl } = d[node.id]
              let data = {}
              
              // Get the current viewer container
              const viewerContainer = document.querySelector(`#hologram-canvas-${node.id}`)?.closest('.viewer-container')
              if (viewerContainer) {
                // Capture the current state of the hologram viewer
                const canvas = document.querySelector(`#hologram-canvas-${node.id}`)
                if (canvas && canvas._renderer && canvas._scene && canvas._camera) {
                  // Ensure background color is applied
                  canvas._renderer.setClearColor(bgColor || '#000000', 1)
                  canvas._renderer.render(canvas._scene, canvas._camera)
                  
                  // Capture the current view
                  let base64Data = canvas.toDataURL('image/png')
                  data.image = base64Data
                }
              }
              
              // Include other necessary data
              if (mpdUrl) {
                data.mpdUrl = mpdUrl
              }
              
              return data
            } else {
              return {}
            }
          }
        }
        node.addCustomWidget(widget)
        return widget
      }
    }
  },

  async init () {
    await loadExternalScript('/8i/app/lib/model-viewer.min.js')
    console.log("Loaded model-viewer.min.js")
    // Expose THREE globally for DashPlayer
    window.THREE = THREE;
    console.log('Set THREE globally:', window.THREE ? 'Success' : 'Failed');
    await loadExternalScript('/8i/app/lib/DashPlayer.js', 'module');
    
  },

  async beforeRegisterNodeDef (nodeType, nodeData, app) {
    if (nodeType.comfyClass == '3DImage') {
      console.log('nodeType.comfyClass', nodeType.comfyClass)
      const orig_nodeCreated = nodeType.prototype.onNodeCreated
      nodeType.prototype.onNodeCreated = async function () {
        orig_nodeCreated?.apply(this, arguments)
        const uploadWidget = this.widgets.filter(w => w.name == 'upload')[0]
        const widget = {
          type: 'div',
          name: 'upload-preview',
          draw (ctx, node, widget_width, y, widget_height) {
            Object.assign(
              this.div.style,
              get_position_style(ctx, widget_width - 122, 88, node.size[1], 44)
            )
          }
        }
        widget.div = $el('div', {})
        widget.div.style.width = `120px`
        document.body.appendChild(widget.div)
        const inputDiv = (key, placeholder, preview) => {
          let div = document.createElement('div')
          
          // Add MPD URL input container with improved styling
          const mpdUrlContainer = document.createElement('div')
          mpdUrlContainer.style = `
            display: flex;
            margin: 8px 24px;
            width: calc(100% - 48px);
            justify-content: center;
            align-items: center;
          `
          
          const mpdUrlInput = document.createElement('input')
          mpdUrlInput.className = "comfy-multiline-input mpd-url-input"
          mpdUrlInput.placeholder = "Enter MPD URL here"
          mpdUrlInput.style = `
            flex: 1;
            height: 32px;
            margin-right: 8px;
            padding: 4px 8px;
            min-width: 200px;
          `
          mpdUrlContainer.appendChild(mpdUrlInput)
          
          const loadMpdBtn = document.createElement('button')
          loadMpdBtn.className = "comfy-multiline-input load-mpd-btn"
          loadMpdBtn.innerText = "Load MPD"
          loadMpdBtn.style = `
            width: 80px;
            height: 32px;
            padding: 4px 8px;
          `
          mpdUrlContainer.appendChild(loadMpdBtn)
          
          div.appendChild(mpdUrlContainer)
          
          div.style = `
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding: 0 12px;
            box-sizing: border-box;
          `
          
          let that = this
          // Handle MPD URL loading
          loadMpdBtn.addEventListener('click', async event => {
            const mpdUrl = mpdUrlInput.value.trim()
            if (mpdUrl) {
              loadMpdBtn.disabled = true
              loadMpdBtn.innerText = 'Loading...'
              try {
                // Try loading up to 3 times
                let success = false
                for(let attempt = 0; attempt < 3 && !success; attempt++) {
                  try {
                    await handleModelLoading(mpdUrl, true)
                    success = true
                  } catch(err) {
                    console.log(`Loading attempt ${attempt + 1} failed:`, err)
                    if(attempt < 2) {
                      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s between attempts
                    }
                  }
                }
                if(!success) {
                  throw new Error("Failed to load MPD after multiple attempts")
                }
              } catch(error) {
                console.error("MPD loading failed:", error)
                alert("Failed to load MPD. Please try again.")
              } finally {
                loadMpdBtn.disabled = false
                loadMpdBtn.innerText = 'Load'
              }
            } else {
              alert("Please enter an MPD URL")
            }
          })
          // Function to handle both GLB and MPD loading
          const handleModelLoading = async (url, isMpd) => {
            let html
            if (isMpd) {
              // First ensure THREE.js and DashPlayer are properly loaded
              if (!window.THREE || !window.DashPlayer || !window.DashPlayerWebGLImplementation) {
                console.log("Waiting for dependencies to load...")
                await new Promise((resolve) => {
                  const checkDeps = () => {
                    if (window.THREE && window.DashPlayer && window.DashPlayerWebGLImplementation) {
                      resolve()
                    } else {
                      setTimeout(checkDeps, 100)
                    }
                  }
                  checkDeps()
                })
              }
              
              // Create a canvas for Three.js rendering of the DashPlayer hologram
              html = `<div class="viewer-container" style="
                width: ${that.size[0] - 96}px; 
                height: ${that.size[1] - 88}px; 
                position: relative; 
                margin: 24px 48px;
                background-color: #000000;
                display: flex;
                justify-content: center;
                align-items: center;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
              ">
                <canvas id="hologram-canvas-${that.id}" style="
                  width: 100%;
                  height: 100%;
                  display: block;
                "></canvas>
                <div class="controls" style="
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  right: 0;
                  background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.7));
                  padding: 16px;
                  display: flex;
                  gap: 16px;
                  align-items: center;
                ">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: white; font-size: 14px;">Background:</span>
                    <input type="color" class="bg-color" value="#000000" style="
                      width: 40px;
                      height: 40px;
                      border: none;
                      border-radius: 4px;
                      padding: 2px;
                      background: #ffffff1a;
                      cursor: pointer;
                    ">
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: white; font-size: 14px;">Frames:</span>
                    <input type="number" class="frame-count" value="24" min="1" max="120" style="
                      width: 60px;
                      height: 32px;
                      border: none;
                      border-radius: 4px;
                      padding: 4px 8px;
                      background: #ffffff1a;
                      color: white;
                      font-size: 14px;
                    ">
                  </div>
                  <button class="playback-control" style="
                    height: 32px;
                    width: 32px;
                    padding: 0;
                    border: none;
                    border-radius: 4px;
                    background: #2196f3;
                    color: white;
                    font-size: 14px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                    <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  </button>
                </div>
              </div>`
            } else {
              // Use model-viewer for GLB files with updated styling
              html = `<div class="viewer-container" style="width: ${that.size[0] - 48}px; height: ${that.size[1] - 88}px; position: relative; margin: 24px auto;">
                <model-viewer src="${url}" 
                oncontextmenu="return false;"
                  style="width: 100%; height: 100%; display: block;"
                min-field-of-view="0deg" 
                max-field-of-view="180deg"
                min-camera-orbit="auto auto 0m"
                max-camera-orbit="auto auto 1000m"
                shadow-intensity="1" 
                camera-controls 
                touch-action="pan-y">
                </model-viewer>
                <div class="controls" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); padding: 8px;">
                  <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; gap: 4px; align-items: center;">
                      <span>Variant:</span>
                      <select class="variant" style="min-width: 100px;"></select>
                  </div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                      <span>Material:</span>
                      <select class="material" style="min-width: 100px;"></select>
                      <div class="material_img" style="display: flex; gap: 4px;"></div>
                  </div>
                    <button class="bg" style="padding: 4px 8px;">BG</button>
                    <div style="display: flex; gap: 4px; align-items: center;">
                      <input class="ddcap_distant" type="number" min="1" step="1" value="55" style="width: 60px;">
                      <input class="total_images" type="number" min="1" max="180" step="1" value="20" style="width: 60px;">
                      <input class="ddcap_range" type="number" min="0" max="20" step="0.1" value="2.1" style="width: 60px;"> 
                      <button class="ddcap" style="padding: 4px 8px;">Capture Rotational Screenshots</button>
                </div>
                    <button class="export" style="padding: 4px 8px;">Export GLB</button>
                  </div>
                </div>
              </div>`
            }
            preview.innerHTML = html
            
            // Update preview container styling
            preview.style = `
              display: flex;
              justify-content: center;
              align-items: center;
              background-repeat: no-repeat;
              background-size: contain;
              width: ${that.size[0] - 48}px;
              height: ${that.size[1] - 88}px;
              position: relative;
              margin: 0 auto;
            `
            if (that.size[1] < 400) {
              that.setSize([that.size[0], that.size[1] + 300])
              app.canvas.draw(true, true)
            }
            if (isMpd) {
              // Initialize DashPlayer hologram
              const canvas = document.getElementById(`hologram-canvas-${that.id}`)
              if (!canvas) {
                throw new Error("Canvas element not found")
              }

              // Wait for canvas to be properly sized
              await new Promise(resolve => {
                if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
                  resolve()
                } else {
                  const observer = new ResizeObserver(() => {
                    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
                      observer.disconnect()
                      resolve()
                    }
                  })
                  observer.observe(canvas)
                }
              })

              const scene = new THREE.Scene()
              const camera = new THREE.PerspectiveCamera(
                70, 
                canvas.clientWidth / canvas.clientHeight, 
                1, 
                1000
              )
              const renderer = new THREE.WebGLRenderer({
                antialias: true,
                canvas: canvas,
                alpha: true
              })
              
              // Ensure proper initialization
              renderer.setPixelRatio(window.devicePixelRatio)
              renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)  // false to prevent style changes
              camera.position.z = 5
              
              // Store references on canvas for resize handling
              canvas._scene = scene
              canvas._camera = camera
              canvas._renderer = renderer
              
              // Load the hologram using the new DashPlayer-based loader with error handling
              const hologram = await load8iHologram(scene, renderer, camera, url)
              if (!hologram || !hologram.mesh) {
                throw new Error("Failed to load hologram mesh")
              }

              // Setup a callback similar to the original oncanplay behavior with error handling
              hologram.oncanplay = () => {
                if (hologram.mesh) {
                  hologram.mesh.visible = true
                  try {
                  hologram.play()
                  } catch(err) {
                    console.error("Error playing hologram:", err)
                  }
                }
              }
              // Animation loop
              let animationFrame
              function render(timestamp) {
                animationFrame = requestAnimationFrame(render)
                hologram.update(timestamp)
                renderer.render(scene, camera)
              }
              render()
              // Store cleanup function
              that.cleanupHologram = () => {
                if (animationFrame) {
                  cancelAnimationFrame(animationFrame)
                }
                if (hologram && hologram.dispose) {
                  hologram.dispose()
                }
              }
              // Setup controls for DashPlayer hologram display
              const bgColorInput = preview.querySelector('.bg-color')
              const frameCountInput = preview.querySelector('.frame-count')
              const playbackControl = preview.querySelector('.playback-control')
              const playIcon = preview.querySelector('.play-icon')
              const pauseIcon = preview.querySelector('.pause-icon')
              const viewerContainer = preview.querySelector('.viewer-container')

              // Initialize or get existing data
              const key = '8i_3d_data'
              let localData = getLocalData(key)
              if (!localData) {
                localData = {}
                setLocalDataOfWin(key, localData)
              }
              if (!localData[that.id]) {
                localData[that.id] = {}
              }

              // Handle background color changes and persistence
              const handleBgColorChange = (e) => {
                const color = e.target.value
                viewerContainer.style.backgroundColor = color
                if (renderer) {
                  renderer.setClearColor(color, 1)
                renderer.render(scene, camera)
                }
                // Save color to local data
                if (!localData[that.id]) localData[that.id] = {}
                localData[that.id].bgColor = color
                setLocalDataOfWin(key, localData)
              }

              bgColorInput.addEventListener('input', handleBgColorChange)

              // Restore saved background color if it exists
              if (localData[that.id]?.bgColor) {
                const savedColor = localData[that.id].bgColor
                viewerContainer.style.backgroundColor = savedColor
                bgColorInput.value = savedColor
                if (renderer) {
                  renderer.setClearColor(savedColor, 1)
                  renderer.render(scene, camera)
                }
              }

              // Handle playback control
              let isPlaying = true;
              playbackControl.addEventListener('click', () => {
                isPlaying = !isPlaying;
                playIcon.style.display = isPlaying ? 'none' : 'block';
                pauseIcon.style.display = isPlaying ? 'block' : 'none';
                if (hologram) {
                  if (isPlaying) {
                    hologram.play();
                  } else {
                    hologram.player.pause();
                  }
                }
              });

              // Store frame count in local data
              frameCountInput.addEventListener('change', () => {
                const frameCount = parseInt(frameCountInput.value);
                if (frameCount >= 1 && frameCount <= 120) {
                  localData[that.id].frameCount = frameCount;
                  setLocalDataOfWin(key, localData);
                }
              });

              // Restore saved frame count if it exists
              if (localData[that.id]?.frameCount) {
                frameCountInput.value = localData[that.id].frameCount;
              }

              localData[that.id].mpdUrl = url;
              setLocalDataOfWin(key, localData);

              const sleep = (t = 1000) => {
                return new Promise((res, rej) => {
                  return setTimeout(() => {
                    res(t)
                  }, t)
                })
              }

              async function captureHologramImage(isUrl = true) {
                // Ensure we render with current camera position and background
                const bgColor = localData[that.id]?.bgColor || '#000000'
                renderer.setClearColor(bgColor, 1)
                renderer.render(scene, camera)
                
                // Capture the current state
                let base64Data = canvas.toDataURL('image/png')
                const contentType = getContentTypeFromBase64(base64Data)
                const blob = await base64ToBlobFromURL(base64Data, contentType)
                
                if (isUrl) {
                  return await uploadImage(blob, '.png')
                }
                return await uploadImage_(blob, '.png')
              }

              // Store the capture function for use during node execution
              that.captureFrames = async () => {
                const frameCount = parseInt(frameCountInput.value)
                console.log('Starting capture with frame count:', frameCount)

                if (frameCount < 1 || frameCount > 120) {
                  console.error('Invalid frame count')
                  return []
                }

                if (!hologram || !hologram.player) {
                  console.error('Hologram or player not initialized')
                  return []
                }

                // Store captured frames
                let frames = []
                
                try {
                    // Stop any ongoing playback
                    hologram.player.pause()
                    
                    // Get total duration and calculate time per frame
                    const duration = hologram.player.duration
                    const timePerFrame = duration / frameCount
                    
                    console.log('Animation duration:', duration, 'Time per frame:', timePerFrame)

                    // Reset to beginning
                    hologram.player.currentTime = 0
                    
                    // Function to capture a single frame at current time
                    const captureCurrentFrame = async () => {
                        return new Promise(async (resolve) => {
                            // Force a render update
                            renderer.render(scene, camera)
                            
                            try {
                                const frame = await captureHologramImage(false)
                                resolve(frame)
                            } catch (error) {
                                console.error('Error capturing frame:', error)
                                resolve(null)
                            }
                        })
                    }

                    // Capture frames sequentially
                    for (let i = 0; i < frameCount; i++) {
                        // Set exact time for this frame
                        const targetTime = i * timePerFrame
                        hologram.player.currentTime = targetTime
                        
                        // Wait for the frame to be ready
                        await new Promise(resolve => {
                            const checkTime = () => {
                                const currentTime = hologram.player.currentTime
                                if (Math.abs(currentTime - targetTime) < 0.01) {
                                    resolve()
                                } else {
                                    requestAnimationFrame(checkTime)
                                }
                            }
                            checkTime()
                        })

                        // Capture the frame
                        const frame = await captureCurrentFrame()
                        if (frame) {
                            frames.push(frame)
                            console.log(`Captured frame ${i + 1}/${frameCount} at time ${targetTime}`)
                        }
                    }

                    console.log(`Successfully captured ${frames.length} frames`)
                    return frames

                } catch (error) {
                    console.error('Error during capture:', error)
                    return frames
                } finally {
                    // Resume normal playback
                    hologram.play()
                }
              }

              // Update node execution to properly handle frame capture
              const onExecuted = nodeType.prototype.onExecuted
              nodeType.prototype.onExecuted = async function (message) {
                if (this.captureFrames) {
                    try {
                        console.log('Starting frame capture process')
                        const frames = await this.captureFrames()
                        
                        if (frames && frames.length > 0) {
                            console.log(`Successfully captured ${frames.length} frames`)
                            // Store frames in message output
                            message.images = frames
                        } else {
                            console.error('No frames were captured')
                            message.images = []
                        }
                    } catch (error) {
                        console.error('Error in frame capture process:', error)
                        message.images = []
                    }
                }
                
                // Call original onExecuted after frame capture is complete
                const r = onExecuted?.apply?.(this, arguments)
                return r
              }

              // Add animation state change handlers
              hologram.player.addEventListener('seeked', () => {
                console.log('Seeked to time:', hologram.player.currentTime)
              })

              hologram.player.addEventListener('timeupdate', () => {
                // Removed frequent logging to avoid console spam
              })
            } else {
              // Original GLB model handling code remains unchanged.
              const modelViewerVariants = preview.querySelector('model-viewer')
              const select = preview.querySelector('.variant')
              const selectMaterial = preview.querySelector('.material')
              const material_img = preview.querySelector('.material_img')
              const bg = preview.querySelector('.bg')
              const exportGLB = preview.querySelector('.export')
              const ddcap_distant = preview.querySelector('.ddcap_distant')
              const total_images = preview.querySelector('.total_images')
              const ddcap_range = preview.querySelector('.ddcap_range')
              const ddCap = preview.querySelector('.ddcap')
              const sleep = (t = 1000) => {
                return new Promise((res, rej) => {
                  return setTimeout(() => {
                    res(t)
                  }, t)
                })
              }
              async function captureImage (isUrl = true) {
                let base64Data = modelViewerVariants.toDataURL()
                const contentType = getContentTypeFromBase64(base64Data)
                const blob = await base64ToBlobFromURL(base64Data, contentType)
                if (isUrl) return await uploadImage(blob, '.png')
                return await uploadImage_(blob, '.png')
              }
              async function captureImages (ddcap_range = 1, total_images = 12, distant = 0.23) {
                var center = modelViewerVariants.getBoundingBoxCenter().toString()
                modelViewerVariants.cameraTarget = center
                const startAngle = -((total_images - 1) / 2) * ddcap_range
                const angles = {}
                for (let i = 0; i < total_images; i++) {
                  angles[i + 1] = startAngle + i * ddcap_range
                }
                console.log(angles)
                let frames = []
                modelViewerVariants.removeAttribute('camera-controls')
                for (let i = 0; i < total_images; i++) {
                  setCameraOrbit(modelViewerVariants, distant, angles, i + 1)
                  await sleep(1000)
                  let file = await captureImage(false)
                  frames.push(file)
                }
                await sleep(1000)
                modelViewerVariants.setAttribute('camera-controls', '')
                return frames
              }
              ddCap.addEventListener('click', async e => {
                const distant = Number(ddcap_distant.value),
                  totalImages = Number(total_images.value),
                  angleIncrement = Number(ddcap_range.value)
                console.log(angleIncrement, totalImages)
                let images = await captureImages(angleIncrement, totalImages, distant)
                localData[that.id].images = images
                setLocalDataOfWin(key, localData)
              })
              ddcap_distant.addEventListener('input', async e => {
                const center = modelViewerVariants.getBoundingBoxCenter().toString()
                modelViewerVariants.cameraTarget = center;
                const initialCameraOrbit = modelViewerVariants.cameraOrbit.split(' ')
                modelViewerVariants.cameraOrbit = `${initialCameraOrbit[2]} ${initialCameraOrbit[1]} ${ddcap_distant.value}m`
                modelViewerVariants.setAttribute('camera-controls', '')
              })
              if (modelViewerVariants) {
                modelViewerVariants.style.width = `${that.size[0] - 48}px`
                modelViewerVariants.style.height = `${that.size[1] - 48}px`
              }
              modelViewerVariants.addEventListener('load', async () => {
                const names = modelViewerVariants.availableVariants
                for (const name of names) {
                  const option = document.createElement('option')
                  option.value = name
                  option.textContent = name
                  select.appendChild(option)
                }
                if (names.length === 0) {
                  const option = document.createElement('option')
                  option.value = 'default'
                  option.textContent = 'Default'
                  select.appendChild(option)
                }
                extractMaterial(modelViewerVariants, selectMaterial, material_img)
              })
              let timer = null
              const delay = 500
              async function checkCameraChange () {
                let dd = getLocalData(key)
                let url = await captureImage()
                let bg_blob = await base64ToBlobFromURL(
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88uXrPQAFwwK/6xJ6CQAAAABJRU5ErkJggg=='
                )
                let url_bg = await uploadImage(bg_blob, '.png')
                if (!dd[that.id]) {
                  dd[that.id] = { url, bg: url_bg }
                } else {
                  dd[that.id] = { ...dd[that.id], url }
                }
                let thumbUrl = material_img.getAttribute('src')
                if (thumbUrl) {
                  let tb = await base64ToBlobFromURL(thumbUrl)
                  let tUrl = await uploadImage(tb, '.png')
                  dd[that.id].material = tUrl
                }
                setLocalDataOfWin(key, dd)
              }
              function startTimer () {
                if (timer) clearTimeout(timer)
                timer = setTimeout(checkCameraChange, delay)
              }
              modelViewerVariants.addEventListener('camera-change', startTimer)
              select.addEventListener('input', async event => {
                modelViewerVariants.variantName =
                  event.target.value === 'default' ? null : event.target.value
                await extractMaterial(modelViewerVariants, selectMaterial, material_img)
                checkCameraChange()
              })
              selectMaterial.addEventListener('input', event => {
                material_img.setAttribute('src', selectMaterial.value)
                if (selectMaterial.getAttribute('data-new-material')) {
                  let index =
                    ~~selectMaterial.selectedOptions[0].getAttribute('data-index')
                  changeMaterial(
                    modelViewerVariants,
                    modelViewerVariants.model.materials[index],
                    selectMaterial.getAttribute('data-new-material')
                  )
                }
                checkCameraChange()
              })
              const updateBgData = (id, key, url, w, h) => {
                let dd = getLocalData(key)
                if (!dd[id]) dd[id] = { url: '', bg: url }
                dd[id] = {
                  ...dd[id],
                  bg: url,
                  bg_w: w,
                  bg_h: h
                }
                setLocalDataOfWin(key, dd)
              }
              bg.addEventListener('click', async () => {
                updateBgData(that.id, key, '', 0, 0)
                preview.style.backgroundImage = 'none'
                let base64 = await inputFileClick(false, false)
                preview.style.backgroundImage = 'url(' + base64 + ')'
                const contentType = getContentTypeFromBase64(base64)
                const blob = await base64ToBlobFromURL(base64, contentType)
                let bg_url = await uploadImage(blob, '.png')
                let bg_img = await createImage(base64)
                updateBgData(
                  that.id,
                  key,
                  bg_url,
                  bg_img.naturalWidth,
                  bg_img.naturalHeight
                )
                let w = that.size[0] - 128,
                  h = (w * bg_img.naturalHeight) / bg_img.naturalWidth
                if (modelViewerVariants) {
                  modelViewerVariants.style.width = `${w}px`
                  modelViewerVariants.style.height = `${h}px`
                }
                preview.style.width = `${w}px`
              })
              exportGLB.addEventListener('click', async () => {
                const glTF = await modelViewerVariants.exportScene()
                const file = new File([glTF], 'export.glb')
                const link = document.createElement('a')
                link.download = file.name
                link.href = URL.createObjectURL(file)
                link.click()
              })
              uploadWidget.value = await uploadWidget.serializeValue()
              let dd = getLocalData(key)
              if (dd[that.id]) {
                const { bg_w, bg_h } = dd[that.id]
                if (bg_h && bg_w) {
                  let w = that.size[0] - 48,
                    h = (w * bg_h) / bg_w
                  if (modelViewerVariants) {
                    modelViewerVariants.style.width = `${w}px`
                    modelViewerVariants.style.height = `${h}px`
                  }
                  preview.style.width = `${w}px`
                }
              }
            }
          }
          return div
        }
        async function extractMaterial (modelViewerVariants, selectMaterial, material_img) {
          const materialsNames = []
          for (let index = 0; index < modelViewerVariants.model.materials.length; index++) {
            let m = modelViewerVariants.model.materials[index]
            let thumbUrl
            try {
              thumbUrl =
                await m.pbrMetallicRoughness.baseColorTexture.texture.source.createThumbnail(1024, 1024)
            } catch (error) {}
            if (thumbUrl)
              materialsNames.push({
                value: m.name,
                text: `#${index} ${m.name}`,
                index,
                thumbUrl
              })
          }
          selectMaterial.innerHTML = ''
          material_img.innerHTML = ''
          for (let index = 0; index < materialsNames.length; index++) {
            const name = materialsNames[index]
            const option = document.createElement('option')
            option.value = name.thumbUrl
            option.textContent = name.text
            option.setAttribute('data-index', index)
            selectMaterial.appendChild(option)
            let img = new Image()
            img.src = name.thumbUrl
            img.style.width = '40px'
            material_img.appendChild(img)
            if (index == 0) {
              material_img.setAttribute('src', name.thumbUrl)
            }
          }
        }
        async function changeMaterial (modelViewerVariants, targetMaterial, newImageUrl) {
          const targetTexture = await modelViewerVariants.createTexture(newImageUrl)
          targetMaterial.pbrMetallicRoughness.baseColorTexture.setTexture(targetTexture)
        }
        function inputFileClick (isFileURL = false, isGlb = false) {
          return new Promise((res, rej) => {
            var input = document.createElement('input')
            input.type = 'file'
            input.accept = isGlb ? '.glb' : 'image/*'
            input.addEventListener('change', function () {
              var file = input.files[0]
              if (isFileURL) {
                res(URL.createObjectURL(file))
                return
              }
              var reader = new FileReader()
              reader.addEventListener('load', async () => {
                let base64 = reader.result
                input.remove()
                res(base64)
              })
              reader.readAsDataURL(file)
            })
            input.click()
          })
        }
        let preview = document.createElement('div')
        preview.className = 'preview'
        preview.style = `margin-top: 12px;
          display: flex;
          justify-content: center;
          align-items: center;
          background-repeat: no-repeat;
          background-size: contain;`
        let upload = inputDiv('_mixlab_3d_image', '3D Model', preview)
        widget.div.appendChild(upload)
        widget.div.appendChild(preview)
        this.addCustomWidget(widget)
        const onResize = this.onResize
        let that = this
        this.onResize = function () {
          let modelViewerVariants = preview.querySelector('model-viewer')
          let hologramCanvas = preview.querySelector(`#hologram-canvas-${that.id}`)
          let viewerContainer = preview.querySelector('.viewer-container')
          let dd = getLocalData('_mixlab_3d_image')
          
          // Calculate new dimensions
          let w = that.size[0] - 48
          let h = that.size[1] - 88  // Account for controls height
          
          // Update preview container
          preview.style = `
            display: flex;
            justify-content: center;
            align-items: center;
            background-repeat: no-repeat;
            background-size: contain;
            width: ${w}px;
            height: ${h}px;
            position: relative;
            margin: 0 auto;
          `
          
          if (viewerContainer) {
            viewerContainer.style = `
              width: ${w}px;
              height: ${h}px;
              position: relative;
              margin: 24px auto;
            `
          }
          
            if (modelViewerVariants) {
            // Update model-viewer dimensions
            modelViewerVariants.style.width = '100%'
            modelViewerVariants.style.height = '100%'
            }
          
            if (hologramCanvas) {
            // Update hologram canvas dimensions
            hologramCanvas.style.width = '100%'
            hologramCanvas.style.height = '100%'
            
            // Update renderer and camera
              const renderer = hologramCanvas._renderer
              if (renderer) {
              renderer.setSize(w, h)
              
              // Update camera aspect ratio
              const camera = hologramCanvas._camera
              if (camera) {
                camera.aspect = w / h
                camera.updateProjectionMatrix()
              }
              
              // Force a re-render
              renderer.render(hologramCanvas._scene, camera)
            }
          }
          
          // Handle background image scaling if present
          if (dd[that.id]) {
            const { bg_w, bg_h } = dd[that.id]
            if (bg_h && bg_w) {
              let bg_h = (w * bg_h) / bg_w
              if (viewerContainer) {
                viewerContainer.style.height = `${bg_h}px`
              }
              if (hologramCanvas) {
                hologramCanvas.style.height = '100%'
                const renderer = hologramCanvas._renderer
                if (renderer) {
                  renderer.setSize(w, bg_h)
              }
            }
          }
          }
          
          return onResize?.apply(this, arguments)
        }
        const onRemoved = this.onRemoved
        this.onRemoved = function() {
          upload.remove()
          preview.remove()
          widget.div.remove()
          if (this.cleanupHologram) {
            this.cleanupHologram()
          }
          return onRemoved?.()
        }
        if (this.onResize) {
          this.onResize(this.size)
        }
        this.serialize_widgets = false
      }
    }
  },
  async loadedGraphNode (node, app) {
    const sleep = (t = 1000) => {
      return new Promise((res, rej) => {
        setTimeout(() => res(1), t)
      })
    }
    if (node.type === '3DImage') {
      let widget = node.widgets.filter(w => w.name === 'upload-preview')[0]
      if (!widget) return;
      let dd = getLocalData('_mixlab_3d_image')
      let id = node.id
      if (!dd[id]) return
      let { url, bg, mpdUrl } = dd[id]
      if (!url && !mpdUrl) return
      let pre = widget.div.querySelector('.preview')
      pre.style.width = `${node.size[0] - 24}px`
      if (url) {
        pre.innerHTML = `<img src="${url}" style="width:100%"/>`
      } else if (mpdUrl) {
        pre.innerHTML = `<div>Hologram: ${mpdUrl}</div>`
      }
      if (bg) {
        pre.style.backgroundImage = 'url(' + bg + ')'
      }
      const uploadWidget = node.widgets.filter(w => w.name == 'upload')[0]
      if (uploadWidget) {
        uploadWidget.value = await uploadWidget.serializeValue()
      }
    }
  }
})

