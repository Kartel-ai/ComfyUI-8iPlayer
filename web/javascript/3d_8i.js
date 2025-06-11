// ------------------------------
// DASH PLAYER / THREE.JS HOLOGRAM SETUP
// ------------------------------
import { app } from '/scripts/app.js'
import { api } from '/scripts/api.js'
import { $el } from '/scripts/ui.js'
import * as THREE from './three.module.js'
import { OrbitControls } from './OrbitControls.js'
import { RoomEnvironment } from './RoomEnvironment.js'
import { RGBELoader } from './RGBELoader.js'
import { loadExternalScript, get_position_style } from './common.js'

// Set THREE globally
window.THREE = THREE;
console.log("Set THREE globally: Success");

// Déclaration globale de la variable hologram pour y accéder depuis différentes portées
let globalHologram;

// Définition de la fonction captureFrames globale
async function captureFrames(countToCapture, node) {
  console.log("[FRAME_CAPTURE] Starting to capture frames:", countToCapture, "for node:", node.id);
  
  // Trouver l'élément d'affichage de progression HTML
  const progressElement = node.previewWidget?.div?.querySelector('.capture-progress-display'); // Accès via le previewWidget potentiel
  
  if (progressElement) { 
    progressElement.innerText = 'Starting capture...'; 
    progressElement.style.display = 'block'; // Rendre visible
  }
  
  // Désactiver les contrôles de la caméra
  let controls = globalHologram?.controls;
  let originalControlsEnabled = true;
  if (controls) {
    originalControlsEnabled = controls.enabled;
    controls.enabled = false;
    console.log("[FRAME_CAPTURE] Disabled OrbitControls");
  } else {
     console.warn("[FRAME_CAPTURE] OrbitControls not found on hologram object.");
  }
  
  // Vérifier si hologram existe
  if (!globalHologram || !globalHologram.player) {
    console.error("[FRAME_CAPTURE] No hologram player found!");
    return [];
  }
  
  // Créer une durée par défaut si nécessaire ou utiliser celle du player
  let duration = 10; // Durée par défaut de 10 secondes
  
  // Essayons de récupérer la durée réelle, mais ne bloquons pas indéfiniment
  try {
    console.log("[FRAME_CAPTURE] Checking for player duration");
    
    // Première tentative de lecture directe
    if (globalHologram.player && typeof globalHologram.player.duration === 'number' && !isNaN(globalHologram.player.duration)) {
      duration = globalHologram.player.duration;
      console.log("[FRAME_CAPTURE] Found duration from player:", duration);
    } else {
      // Essayons d'autres méthodes pour obtenir la durée
      console.log("[FRAME_CAPTURE] Player properties:", Object.keys(globalHologram.player));
      
      if (globalHologram.player.getDuration) {
        duration = globalHologram.player.getDuration();
        console.log("[FRAME_CAPTURE] Got duration from getDuration():", duration);
      } else {
        console.log("[FRAME_CAPTURE] Using default duration:", duration);
      }
    }
  } catch (error) {
    console.error("[FRAME_CAPTURE] Error getting duration:", error);
    console.log("[FRAME_CAPTURE] Using default duration:", duration);
  }
  
  // Calculate time per frame
  const timePerFrame = duration / countToCapture;
  console.log("[FRAME_CAPTURE] Time per frame:", timePerFrame, "Duration:", duration);
  
  // Array to store all captured frames
  let capturedFrames = [];
  
  // Get keyframes for animation
  const nodeData = getLocalData('8i_3d_data')[node.id];
  const keyframes = nodeData?.keyframes;

  // Reset to beginning
  console.log("[FRAME_CAPTURE] Resetting player to beginning");
  globalHologram.player.currentTime = 0;
  
  // Create a sleep function
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Pause playback during capture
  const wasPlaying = !globalHologram.player.paused;
  console.log("[FRAME_CAPTURE] Was playing:", wasPlaying);
  if (wasPlaying) {
    console.log("[FRAME_CAPTURE] Pausing player");
    globalHologram.player.pause();
  }
  
  // Récupérer le canvas au début
  // On essaie plusieurs approches car l'ID peut ne pas correspondre exactement
  console.log("[FRAME_CAPTURE] Searching for canvas");
  let canvas = null;
  
  // Première approche: chercher avec l'ID exact
  canvas = document.querySelector(`#hologram-canvas-${node.id}`);
  if (canvas) {
    console.log(`[FRAME_CAPTURE] Found canvas with exact ID: hologram-canvas-${node.id}`);
  } else {
    // Deuxième approche: chercher un canvas qui contient l'ID dans son ID
    console.log(`[FRAME_CAPTURE] Looking for canvas containing ID ${node.id}`);
    document.querySelectorAll('canvas').forEach(c => {
      if (c.id && c.id.includes(`hologram-canvas`)) {
        console.log(`[FRAME_CAPTURE] Found hologram canvas: ${c.id}`);
        canvas = c;
        
        // Sauvegarder l'ID du canvas trouvé pour le nœud
        try {
          let canvasMapping = JSON.parse(localStorage.getItem('hologram_canvas_mapping') || '{}');
          canvasMapping[node.id] = c.id;
          localStorage.setItem('hologram_canvas_mapping', JSON.stringify(canvasMapping));
          console.log(`[FRAME_CAPTURE] Saved canvas mapping for node ${node.id} -> ${c.id}`);
        } catch (err) {
          console.error("[FRAME_CAPTURE] Error saving canvas mapping:", err);
        }
      }
    });
    
    // Troisième approche: vérifier si nous avons un mappage enregistré
    if (!canvas) {
      try {
        const canvasMapping = JSON.parse(localStorage.getItem('hologram_canvas_mapping') || '{}');
        const savedCanvasId = canvasMapping[node.id];
        if (savedCanvasId) {
          const savedCanvas = document.querySelector(`#${savedCanvasId}`);
          if (savedCanvas) {
            canvas = savedCanvas;
            console.log(`[FRAME_CAPTURE] Using previously mapped canvas: ${savedCanvasId}`);
          }
        }
      } catch (err) {
        console.error("[FRAME_CAPTURE] Error retrieving canvas mapping:", err);
      }
    }
    
    // Quatrième approche: prendre le premier canvas si aucun autre n'est trouvé
    if (!canvas) {
      const allCanvases = Array.from(document.querySelectorAll('canvas'));
      if (allCanvases.length > 0) {
        canvas = allCanvases[0];
        console.log(`[FRAME_CAPTURE] Using first available canvas: ${canvas.id || 'no ID'}`);
        
        // Sauvegarder l'ID du canvas choisi par défaut
        if (canvas.id) {
          try {
            let canvasMapping = JSON.parse(localStorage.getItem('hologram_canvas_mapping') || '{}');
            canvasMapping[node.id] = canvas.id;
            localStorage.setItem('hologram_canvas_mapping', JSON.stringify(canvasMapping));
            console.log(`[FRAME_CAPTURE] Saved default canvas mapping for node ${node.id} -> ${canvas.id}`);
          } catch (err) {
            console.error("[FRAME_CAPTURE] Error saving default canvas mapping:", err);
          }
        }
      } else {
        console.error("[FRAME_CAPTURE] No canvas found at all!");
        return [];
      }
    }
  }
  
  // --- Camera Animation Logic ---
  let isAnimated = keyframes && keyframes.length > 1;
  if (isAnimated) {
    console.log(`[FRAME_CAPTURE] Starting animated capture with ${keyframes.length} keyframes.`);
  } else {
    console.log("[FRAME_CAPTURE] Starting static capture (no keyframes or only one).");
  }
  // --- End Camera Animation Logic ---

  if (!canvas) {
    console.error("[FRAME_CAPTURE] Canvas not found after all attempts!");
    return [];
  }
  
  // Vérifier que le canvas est valide
  console.log(`[FRAME_CAPTURE] Selected canvas dimensions: ${canvas.width}x${canvas.height}`);
  
  try {
    // Capture each frame
    for (let i = 0; i < countToCapture; i++) {
      // Mettre à jour l'affichage de progression HTML
      if (progressElement) { 
        const percent = Math.round(((i + 1) / countToCapture) * 100);
        progressElement.innerText = `Capturing ${i + 1}/${countToCapture} (${percent}%)`; 
      }
      
      // --- Animate Camera Position ---
      if (isAnimated) {
        const totalSegments = keyframes.length - 1;
        const animationProgress = (countToCapture > 1) ? (i / (countToCapture - 1)) : 0;
        const segmentProgress = animationProgress * totalSegments;
        const currentSegmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
        const progressInSegment = segmentProgress - currentSegmentIndex;

        const startKeyframe = keyframes[currentSegmentIndex];
        const endKeyframe = keyframes[currentSegmentIndex + 1];

        if (startKeyframe && endKeyframe) {
          const startPos = new THREE.Vector3(startKeyframe.position.x, startKeyframe.position.y, startKeyframe.position.z);
          const endPos = new THREE.Vector3(endKeyframe.position.x, endKeyframe.position.y, endKeyframe.position.z);
          const interpolatedPosition = new THREE.Vector3().lerpVectors(startPos, endPos, progressInSegment);

          const startTarget = new THREE.Vector3(startKeyframe.target.x, startKeyframe.target.y, startKeyframe.target.z);
          const endTarget = new THREE.Vector3(endKeyframe.target.x, endKeyframe.target.y, endKeyframe.target.z);
          const interpolatedTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, progressInSegment);
          
          globalHologram.controls.object.position.copy(interpolatedPosition);
          globalHologram.controls.target.copy(interpolatedTarget);
          globalHologram.controls.update();
        }
      }
      // --- End Animate Camera Position ---

      // Set the current time
      const targetTime = i * timePerFrame;
      console.log(`[FRAME_CAPTURE] Frame ${i+1}/${countToCapture}: Setting time to ${targetTime}/${duration}`);
      globalHologram.player.currentTime = targetTime;
      
      // Wait for the frame to render
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Waiting for seeked event`);
      let seeked = false;
      
      try {
        await Promise.race([
          new Promise(resolve => {
            const onSeeked = () => {
              globalHologram.player.removeEventListener('seeked', onSeeked);
              seeked = true;
              console.log(`[FRAME_CAPTURE] Frame ${i+1}: Seeked event received`);
              resolve();
            };
            globalHologram.player.addEventListener('seeked', onSeeked);
          }),
          new Promise(resolve => {
            setTimeout(() => {
              if (!seeked) {
                console.log(`[FRAME_CAPTURE] Frame ${i+1}: Seeked event timed out, continuing anyway`);
                resolve();
              }
            }, 10);
          })
        ]);
      } catch (error) {
        console.error(`[FRAME_CAPTURE] Frame ${i+1}: Error during seek:`, error);
      }
      
      // Force render by briefly playing and pausing
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Forcing render with play/pause`);
      try {
        globalHologram.play(); // Start playing to trigger render
        await sleep(35); // Pause minimale pour laisser play() s'initier
        globalHologram.player.pause(); // Pause immediately
        console.log(`[FRAME_CAPTURE] Frame ${i+1}: Play/Pause cycle complete`);
      } catch (err) {
        console.error(`[FRAME_CAPTURE] Frame ${i+1}: Error during play/pause cycle:`, err);
      }
      
      // Pause minimale après le cycle play/pause
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Minimal wait for rendering`);
      await sleep(10); // Réduit de 50ms à 10ms
      
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Canvas found, dimensions: ${canvas.width}x${canvas.height}`);
      
      // Force a render if THREE.js renderer is available
      const renderer = canvas._renderer;
      const scene = canvas._scene;
      const camera = canvas._camera;
      
      if (renderer && scene && camera) {
        console.log(`[FRAME_CAPTURE] Frame ${i+1}: Forcing render with THREE.js`);
        renderer.render(scene, camera);
      } else {
        console.log(`[FRAME_CAPTURE] Frame ${i+1}: No renderer/scene/camera available for forced render`);
      }
      
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Converting canvas to data URL`);
      const dataURL = canvas.toDataURL('image/png');
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Data URL length: ${dataURL.length}`);
      
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Converting to blob`);
      const blob = await (await fetch(dataURL)).blob();
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Blob size: ${blob.size} bytes`);
      
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Uploading image`);
      const file = await uploadImage_(blob, '.png');
      console.log(`[FRAME_CAPTURE] Frame ${i+1}: Upload complete, result:`, file);
      
      capturedFrames.push(file);
      console.log(`[FRAME_CAPTURE] Captured frame ${i+1}/${countToCapture}, frames so far: ${capturedFrames.length}`);
    }
  } catch (error) {
    console.error("[FRAME_CAPTURE] Error during capture:", error);
    console.error(error.stack);
  } finally {
    // Réactiver les contrôles de la caméra
    if (controls) {
      controls.enabled = originalControlsEnabled; // Restaurer l'état précédent
      console.log("[FRAME_CAPTURE] Re-enabled OrbitControls");
    }
    // Masquer/réinitialiser l'affichage de progression HTML
    if (progressElement) { 
      progressElement.innerText = 'Capture complete!'; 
      // Optionnel: le recacher après un délai
      setTimeout(() => {
        if(progressElement.innerText === 'Capture complete!') { // Vérifier si une autre capture n'a pas démarré entre temps
           progressElement.innerText = '';
           progressElement.style.display = 'none'; 
        }
      }, 2000); // Masquer après 2 secondes
    }
    // Restore playback if it was playing before
    if (wasPlaying) {
      console.log("[FRAME_CAPTURE] Restoring playback");
      globalHologram.play();
    }
  }
  
  console.log("[FRAME_CAPTURE] All frames captured:", capturedFrames.length, capturedFrames);
  return capturedFrames;
}

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
  console.log(`[load8iHologram] Initializing DashPlayer for ${mpdUrl}`);
  // Create a new DashPlayer instance with its WebGL implementation.
  const player = new window.DashPlayer(
    renderer,
    new window.DashPlayerWebGLImplementation()
  );
  console.log(`[load8iHologram] DashPlayer created. Setting up controls and render loop...`);
  
  // Create OrbitControls with enhanced freedom
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = true; // Enable screen space panning for more freedom
  controls.enablePan = true; // Enable panning
  controls.enableZoom = true; // Enable zooming
  controls.enableRotate = true; // Enable rotation
  
  // Remove polar angle restrictions for full rotation freedom
  controls.maxPolarAngle = Math.PI; // Allow full vertical rotation
  controls.minPolarAngle = 0; // Allow full vertical rotation
  
  // Remove azimuth restrictions for full horizontal rotation
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  
  // Enhanced zoom settings
  controls.minDistance = 0.1; // Allow very close zoom
  controls.maxDistance = 1000; // Allow very far zoom
  
  // Enhanced pan settings
  controls.panSpeed = 1.0;
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 1.0;
  
  // Start the appropriate render loop.
  if (player.deviceCapabilities && player.deviceCapabilities.requestVideoFrameCallback) {
    player.attachVideoFrameCallback();
  } else {
    player.startRenderLoop();
  }
  
  console.log(`[load8iHologram] Render loop started. Attempting to load manifest...`);
  
  // Load the manifest (mpdUrl) and add the resulting mesh to the scene.
  try {
    await player.loadManifest(mpdUrl);
    console.log(`[load8iHologram] Manifest loaded successfully.`);
    const mesh = player.mesh;
    const MESH_SCALE = 1.0;
    mesh.scale.set(MESH_SCALE * 0.01, MESH_SCALE * 0.01, MESH_SCALE * 0.01);
    mesh.position.y -= MESH_SCALE * 0.75;
    scene.add(mesh);
    console.log(`[load8iHologram] Mesh added to scene.`);
  } catch (error) {
    console.error("[load8iHologram] Failed to load manifest:", error);
    throw error; // Renvoyer l'erreur
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
  
  // Stocker hologram globalement pour utilisation par captureFrames
  globalHologram = hologram;
  
  // Exposer les contrôles pour pouvoir les désactiver plus tard
  hologram.controls = controls;
  
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
              // Récupérer toutes les données potentiellement stockées
              let { bgColor, mpdUrl, cameraState, images: storedImages, lastCaptureTimestamp } = d[node.id]
              let data = {}
              
              // Trouver le previewWidget pour accéder aux éléments HTML
              const previewWidget = node.widgets.find(w => w.name === 'upload-preview');
              const previewDiv = previewWidget?.div;
              
              // Lire le frame count depuis le widget ComfyUI
              const frameCountWidget = node.widgets?.find(w => w.name === 'frame_count');
              const desiredCount = frameCountWidget?.value || 1; // Lire depuis le widget ComfyUI
              
              // Lire le timestamp actuel depuis l'input HTML caché
              const timestampInput = previewDiv?.querySelector('.camera-timestamp-input');
              const currentTimestamp = parseInt(timestampInput?.value || '0', 10); // Lire depuis l'input HTML caché
              
              let final_frames = []; // Pour stocker les images à envoyer

              // Condition pour déterminer s'il faut recapturer
              const needsRecapture = 
                !storedImages || 
                storedImages.length !== desiredCount || 
                currentTimestamp !== lastCaptureTimestamp || 
                lastCaptureTimestamp === undefined;

              console.log(`[serializeValue] Needs Recapture Check: 
                Stored Images Exist: ${!!storedImages} (${storedImages?.length}), 
                Frame Count Match: ${storedImages?.length === desiredCount}, 
                Desired Count: ${desiredCount}, 
                Timestamp Match: ${currentTimestamp === lastCaptureTimestamp}, 
                Current TS: ${currentTimestamp}, 
                Stored TS: ${lastCaptureTimestamp}, 
                --> Needs Recapture: ${needsRecapture}`);

              if (needsRecapture && node.captureFrames) {
                try {
                  console.log(`[serializeValue] Recapture needed. Capturing ${desiredCount} frames.`);
                  final_frames = await node.captureFrames(desiredCount); 
                  
                  // Mettre à jour les images dans localStorage *après* la capture réussie
                  if (final_frames && final_frames.length > 0) {
                      let currentData = getLocalData('8i_3d_data'); // Relire les données locales
                      if (!currentData[node.id]) currentData[node.id] = {};
                      currentData[node.id].images = final_frames;
                      // Stocker le timestamp *actuel* associé à cette capture
                      currentData[node.id].lastCaptureTimestamp = currentTimestamp; 
                      setLocalDataOfWin('8i_3d_data', currentData);
                      console.log(`[serializeValue] Stored ${final_frames.length} newly captured frames and timestamp ${currentTimestamp} in localStorage.`);
                  }
                  
                } catch (err) {
                  console.error('serializeValue: captureFrames error during recapture', err)
                  // En cas d'erreur, essayer d'utiliser les images précédentes si elles existent
                  final_frames = storedImages || []; 
                  console.warn('[serializeValue] Using potentially stale frames from localStorage due to capture error.');
                }
              } else if (!needsRecapture) {
                console.log('[serializeValue] No recapture needed. Reusing stored frames.');
                final_frames = storedImages;
              } else {
                console.warn('[serializeValue] Recapture needed but node.captureFrames function not found, or other issue.');
                // Essayer d'utiliser les images précédentes si elles existent
                final_frames = storedImages || [];
              }
              
              // Utiliser les frames capturées (nouvelles ou anciennes en cas d'erreur)
              if (Array.isArray(final_frames) && final_frames.length > 0) {
                 data.images = final_frames;
              }
              
              // Include other necessary data
              if (mpdUrl) {
                data.mpdUrl = mpdUrl
              }
              
              // Inclure l'état de la caméra si disponible
              if (cameraState) {
                data.cameraState = cameraState;
                console.log("[serializeValue] Included cameraState:", cameraState);
              } else {
                console.warn("[serializeValue] cameraState not found in local data for node", node.id);
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
    // Load model-viewer as a module
    await loadExternalScript('/8i/app/lib/model-viewer.min.js', 'module');
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
        widget.div.style.position = 'absolute';
        widget.div.style.zIndex = '1';
        widget.div.style.width = `120px`
        document.body.appendChild(widget.div)
        
        // Assigner la fonction captureFrames au nœud
        console.log("[NODE] Setting up captureFrames for node", this);
        this.captureFrames = async function(count) {
          console.log("[NODE] captureFrames called from node with current ID:", this.id);
          // Passer l'objet node entier à la fonction globale
          return await captureFrames(count, this);
        };
        
        // inputDiv crée maintenant juste la partie input MPD
        const inputDiv = (key, placeholder) => {
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
            // Vérifier si un chargement est déjà en cours (sécurité supplémentaire)
            if (loadMpdBtn.disabled) {
               console.warn("[LOAD MPD] Load already in progress. Ignoring click.");
               return; 
            }

            const mpdUrl = mpdUrlInput.value.trim()
            if (mpdUrl) {
              // Désactiver immédiatement et changer le texte
              loadMpdBtn.disabled = true
              loadMpdBtn.innerText = 'Loading...'
              
              // Nettoyer l'instance précédente AVANT de charger la nouvelle
              if (that.cleanupHologram) {
                 console.log("[LOAD MPD] Cleaning up previous hologram instance.");
                 try {
                    that.cleanupHologram();
                    that.cleanupHologram = null; // Réinitialiser après nettoyage
                 } catch (cleanupErr) {
                    console.error("[LOAD MPD] Error during cleanup:", cleanupErr);
                 }
              }
              
              let success = false;
              try {
                console.log(`[LOAD MPD] Attempting to load: ${mpdUrl}`);
                await handleModelLoading(mpdUrl, true, that); // Appel direct
                success = true;
                console.log(`[LOAD MPD] handleModelLoading completed successfully for: ${mpdUrl}`);
              } catch (error) {
                // L'erreur vient probablement de handleModelLoading
                console.error("MPD loading failed overall:", error) 
                // Ne pas afficher d'alerte si c'est l'erreur thumbUrl, sinon afficher
                if (!(error && error.message && error.message.includes('thumbUrl is not defined'))) {            
                  alert(`Failed to load MPD: ${error.message || 'Unknown error'}. Check console for details.`); 
                } else {
                  console.warn("[LOAD MPD] Silently ignored 'thumbUrl is not defined' error during MPD load.");
                }
              } finally {
                // Réactiver le bouton SEULEMENT à la toute fin
                loadMpdBtn.disabled = false
                loadMpdBtn.innerText = 'Load'
              }
            } else {
              alert("Please enter an MPD URL")
            }
          })
          // Function to handle both GLB and MPD loading
          const handleModelLoading = async (url, isMpd, that) => {
            let html
            console.log(`[handleModelLoading] Starting for ${isMpd ? 'MPD' : 'GLB'}: ${url}`);
            if (isMpd) {
              console.log("[handleModelLoading] Checking dependencies...");
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
                  padding: 10px 16px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 16px;
                ">
                  <!-- Groupe Background (Couleur + HDR URL) -->
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: white; font-size: 14px; white-space: nowrap;">Background:</span>
                    <input type="color" class="bg-color" value="#000000" style="width: 32px; height: 32px; border: none; border-radius: 4px; padding: 2px; background: #ffffff1a; cursor: pointer;">
                    <input type="text" class="hdr-url-input" placeholder="Or enter HDR URL" style="height: 30px; flex-grow: 1; min-width: 150px; background-color: #333; color: white; border: 1px solid #555; border-radius: 3px; padding: 2px 6px; font-size: 12px;">
                    <button class="load-hdr-url-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #2196F3; color: white; font-size: 12px; cursor: pointer;">Load URL</button>
                  </div>
                  <!-- Groupe Playback & Progress -->
                  <div style="display: flex; align-items: center; gap: 10px;">
                     <!-- Floor Controls -->
                    <button class="toggle-floor-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #607D8B; color: white; font-size: 12px; cursor: pointer;">Toggle Floor</button>
                    <input type="color" class="floor-color-input" value="#555555" title="Floor Color" style="width: 32px; height: 32px; border: none; border-radius: 4px; padding: 2px; background: #ffffff1a; cursor: pointer;">
                    <!-- Shadow Toggle (ajouté ici pour regroupement) -->
                    <button class="toggle-shadows-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #607D8B; color: white; font-size: 12px; cursor: pointer;">Toggle Shadows</button>

                    <!-- Progress Display -->
                    <div class="capture-progress-display" style="display: none; color: white; font-size: 12px; white-space: nowrap;">Starting...</div>
                    <!-- Bouton Play/Pause -->
                    <button class="playback-control" style="height: 32px; width: 32px; padding: 0; border: none; border-radius: 4px; background: #2196f3; color: white; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                      <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                  </div>
                  <!-- Keyframe Controls -->
                  <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid #555; padding-left: 10px;">
                    <span style="color: white; font-size: 14px; white-space: nowrap;">Animation:</span>
                    <button class="add-keyframe-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #4CAF50; color: white; font-size: 12px; cursor: pointer;">Add Keyframe</button>
                    <button class="preview-animation-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #FF9800; color: white; font-size: 12px; cursor: pointer;">Preview</button>
                    <button class="clear-keyframes-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #F44336; color: white; font-size: 12px; cursor: pointer;">Clear</button>
                    <span class="keyframe-count-display" style="color: #DDD; font-size: 12px; white-space: nowrap;">(0 Keyframes)</span>
                  </div>
                  <!-- Node Update Control -->
                  <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid #555; padding-left: 10px;">
                    <button class="force-node-update-button" style="height: 32px; padding: 0 10px; border: none; border-radius: 4px; background: #9C27B0; color: white; font-size: 12px; cursor: pointer;">Update Node</button>
                  </div>
                  <!-- Hidden Timestamp Input (n'affecte pas le layout) -->
                  <input type="hidden" class="camera-timestamp-input" value="${Date.now()}">
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
                <div class="controls" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); padding: 8px; color: white; font-size: 12px;">
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
                    <!-- Contrôles déplacés -->
                    <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 15px; color: white; font-size: 12px;">
                      <!-- Progress Display (initialement caché) -->
                      <div class="capture-progress-display" style="display: none; margin-top: 3px;">Starting...</div>
                      <input type="hidden" class="camera-timestamp-input" value="${Date.now()}">
                    </div>
                  </div>
                </div>
              </div>`
            }
            preview.innerHTML = html
            console.log("[handleModelLoading] Preview HTML set.");
            
            // Update preview container styling
            preview.style = `
              position: relative;
              margin-top: 60px;
              display: flex;
              justify-content: center;
              align-items: center;
              background-repeat: no-repeat;
              background-size: contain;
              width: ${that.size[0] - 48}px;
              height: ${that.size[1] - 88}px;
            `
            if (that.size[1] < 400) {
              that.setSize([that.size[0], that.size[1] + 300])
              app.canvas.draw(true, true)
            }
            if (isMpd) {
              console.log("[handleModelLoading] Initializing MPD viewer...");
              // Initialize DashPlayer hologram
              const canvas = document.getElementById(`hologram-canvas-${that.id}`)
              if (!canvas) {
                throw new Error("Canvas element not found")
              }
              console.log("[handleModelLoading] Canvas found.");

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
              console.log("[handleModelLoading] Canvas sized. Initializing THREE scene...");
              const scene = new THREE.Scene()
              const camera = new THREE.PerspectiveCamera(
                70, 
                canvas.clientWidth / canvas.clientHeight, 
                0.01, // Near clipping plane (réduit)
                1000 // Far clipping plane
              )
              const renderer = new THREE.WebGLRenderer({
                antialias: true,
                canvas: canvas,
                alpha: true
              })
              
              // --- Configuration Ombres --- 
              renderer.shadowMap.enabled = false; // Désactivé par défaut
              renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Type d'ombres
              
              // Créer une lumière directionnelle
              let shadowLight = new THREE.DirectionalLight(0xffffff, 1.0); // Intensité à ajuster
              shadowLight.position.set(5, 10, 7.5); // Position à ajuster
              shadowLight.castShadow = false; // Désactivé par défaut
              // Configurer la map d'ombre (ajuster si besoin de qualité/perf)
              shadowLight.shadow.mapSize.width = 1024;
              shadowLight.shadow.mapSize.height = 1024;
              shadowLight.shadow.camera.near = 0.5;
              shadowLight.shadow.camera.far = 50; 
              scene.add(shadowLight);
              scene.add(shadowLight.target); // La cible est importante pour l'orientation
              // Optionnel: helper pour voir la lumière/caméra d'ombre
              // const shadowCamHelper = new THREE.CameraHelper(shadowLight.shadow.camera);
              // scene.add(shadowCamHelper);
              // --- Fin Configuration Ombres --- 

              // Ensure proper initialization
              renderer.setPixelRatio(window.devicePixelRatio)
              renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)  // false to prevent style changes
              // Set initial background color to ensure proper coverage from start
              renderer.setClearColor('#000000', 1.0)
              camera.position.z = 5
              
              // Store references on canvas for resize handling
              canvas._scene = scene
              canvas._camera = camera
              canvas._renderer = renderer
              
              // Force initial render to establish background properly
              renderer.render(scene, camera)
              
              console.log("[handleModelLoading] THREE scene initialized. Calling load8iHologram...");
              // Load the hologram using the new DashPlayer-based loader with error handling
              let hologram = null;
              try {
                hologram = await load8iHologram(scene, renderer, camera, url)
              } catch (loadError) {
                console.error("[handleModelLoading] Error from load8iHologram:", loadError);
                throw loadError; // Renvoyer l'erreur pour déclencher l'alerte
              }
              console.log("[handleModelLoading] load8iHologram returned.");

              if (!hologram || !hologram.mesh) {
                throw new Error("Failed to load hologram mesh")
              }
              hologram.mesh.castShadow = false; // Désactiver par défaut
              console.log("[handleModelLoading] Hologram mesh loaded. Setting up callbacks and controls...");

              // Vérifier si on atteint bien la configuration HDR
              console.log("[handleModelLoading] Reaching HDR setup section...");

              // Stocker la caméra sur la scène pour y accéder dans loadAndApplyHDR
              scene.userData.camera = camera;
              console.log(`[handleModelLoading] Stored camera ${camera.uuid} in scene userData.`);

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
              // Animation loop with background preservation
              let animationFrame
              function render(timestamp) {
                animationFrame = requestAnimationFrame(render)
                hologram.update(timestamp)
                
                // Ensure background is maintained in every frame
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
                if (shadowLight) scene.remove(shadowLight); // Nettoyer la lumière
              }
              // Setup controls for DashPlayer hologram display
              const bgColorInput = preview.querySelector('.bg-color')
              const playbackControl = preview.querySelector('.playback-control')
              const playIcon = preview.querySelector('.play-icon')
              const pauseIcon = preview.querySelector('.pause-icon')
              const viewerContainer = preview.querySelector('.viewer-container')
              
              // Initialize playback state variables early
              let isPlaying = true;
              let cameraAnimationEnabled = false;
              
              // Utility function to update play button visual state
              const updatePlayButtonState = () => {
                const localData = getLocalData(key);
                const hasKeyframes = localData[that.id]?.keyframes?.length > 1;
                if (hasKeyframes) {
                  playbackControl.style.borderColor = '#FF9800';
                  playbackControl.title = `Play/Pause ${isPlaying ? '(Playing' : '(Paused'} with Camera Animation)`;
                } else {
                  playbackControl.style.borderColor = '';
                  playbackControl.title = `Play/Pause ${isPlaying ? '(Playing)' : '(Paused)'}`;
                }
              };
              
              // Utility function to apply background color robustly
              const applyBackgroundColor = (color) => {
                console.log(`[Background] Applying background color: ${color}`);
                
                // Apply to all elements for complete coverage
                viewerContainer.style.backgroundColor = color
                bgColorInput.value = color
                
                if (renderer) {
                  renderer.setClearColor(color, 1.0)  // Force full opacity
                  // Force multiple renders to ensure the background sticks
                  for(let i = 0; i < 3; i++) {
                    setTimeout(() => renderer.render(scene, camera), i * 50);
                  }
                }
                
                if (canvas) {
                  canvas.style.backgroundColor = color
                }
                
                console.log(`[Background] Applied ${color} to all elements`);
              };

              // --- Logique Upload HDR (Déplacé ici) --- 
              let loadHdrUrlButton = null;
              let hdrUrlInput = null;
              let setupError = false;
              try {
                  console.log("[HDR Setup] Attempting to find HDR URL button...");
                  loadHdrUrlButton = preview.querySelector('.load-hdr-url-button');
                  console.log(`[HDR Setup] Found loadHdrUrlButton: ${!!loadHdrUrlButton}`);

                  console.log("[HDR Setup] Attempting to find HDR URL input...");
                  hdrUrlInput = preview.querySelector('.hdr-url-input');
                  console.log(`[HDR Setup] Found hdrUrlInput: ${!!hdrUrlInput}`);
              } catch (queryError) {
                  console.error("[HDR Setup] Error during querySelector for HDR elements:", queryError);
                  setupError = true;
              }

              // Callback pour mettre à jour l'état des boutons HDR
              const updateHdrButtonsState = (state) => {
                // Utiliser loadHdrUrlButton directement ici
                if (loadHdrUrlButton) {
                   loadHdrUrlButton.disabled = (state === 'loading');
                   if (state === 'loading') loadHdrUrlButton.innerText = 'Loading HDR...';
                   else if (state === 'success') loadHdrUrlButton.innerText = 'HDR Loaded';
                   else if (state === 'error') loadHdrUrlButton.innerText = 'Load Failed';
                    // Peut-être revenir à l'état initial après un délai ?
                    setTimeout(() => { 
                       if(loadHdrUrlButton.innerText !== 'Loading HDR...') {
                          loadHdrUrlButton.innerText = 'Load URL'; 
                          loadHdrUrlButton.disabled = false; // S'assurer qu'il est réactivé
                       }
                    }, 3000);
                }
              };

              // Ajouter l'écouteur pour le bouton URL HDR
              if (!setupError && loadHdrUrlButton && hdrUrlInput) {
                console.log("[HDR Setup] Proceeding to add click listener...");
                loadHdrUrlButton.addEventListener('click', async () => {
                    console.log('[HDR URL Button] Click listener entered.');
                    const url = hdrUrlInput.value.trim();
                    if (!url) {
                        alert("Please enter an HDR URL.");
                        return;
                    }
                    console.log("[HDR Load] URL entered:", url);

                    // Préfixer l'URL si nécessaire
                    let finalHdrUrl = url;
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
                        finalHdrUrl = 'https://' + url;
                        console.log(`[HDR Load] Prefixed URL with https:// -> ${finalHdrUrl}`);
                    } else {
                       console.log("[HDR Load] URL already has prefix or is data URL.");
                    }

                    console.log("[HDR Load] URL entered:", url);
                    updateHdrButtonsState('loading');
                    try {
                       // Passer l'URL (potentiellement préfixée) directement à la fonction factorisée
                       await loadAndApplyHDR(finalHdrUrl, scene, renderer, updateHdrButtonsState);
                    } catch (e) {
                       console.error("[HDR Load] Error loading HDR from URL:", e);
                       alert(`Error loading HDR from URL: ${e.message || 'Unknown error'}`);
                       updateHdrButtonsState('error');
                    }
                });
              } else {
                console.error(`[HDR Setup] Skipping addEventListener. Error during setup: ${setupError}, Button found: ${!!loadHdrUrlButton}, Input found: ${!!hdrUrlInput}`);
              }
              // --- Fin Logique Upload HDR ---

              // --- Logique Sol (Floor) --- 
              let floorMesh = null;
              const toggleFloorButton = preview.querySelector('.toggle-floor-button');
              const floorColorInput = preview.querySelector('.floor-color-input');

              const createFloor = () => {
                 const floorGeometry = new THREE.PlaneGeometry(100, 100); // Taille grande
                 // Matériau simple ou ShadowMaterial si on veut juste recevoir les ombres
                 const floorMaterial = new THREE.MeshStandardMaterial({ 
                    color: floorColorInput.value,
                    roughness: 0.8,
                    metalness: 0.2 
                 }); 
                 // const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.5 }); // Alternative
                 floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
                 floorMesh.rotation.x = -Math.PI / 2; // Orienter horizontalement
                 floorMesh.position.y = -0.75; // Relever le sol pour correspondre au décalage du modèle
                 floorMesh.visible = false; // Initialement caché
                 floorMesh.receiveShadow = false; // Initialement désactivé
                 scene.add(floorMesh);
                 console.log("[Floor] Floor mesh created.");
              };

              if (toggleFloorButton) {
                 toggleFloorButton.addEventListener('click', () => {
                    if (!floorMesh) { // Créer si n'existe pas
                       createFloor();
                    }
                    if (floorMesh) { // Basculer la visibilité
                       floorMesh.visible = !floorMesh.visible;
                       console.log(`[Floor] Toggled visibility to: ${floorMesh.visible}`);
                       // Forcer le rendu
                       if (renderer && scene && camera) renderer.render(scene, camera);
                    }
                 });
              }

              if (floorColorInput) {
                 floorColorInput.addEventListener('input', (event) => {
                    if (floorMesh && floorMesh.material && floorMesh.material.color) {
                       floorMesh.material.color.set(event.target.value);
                       console.log(`[Floor] Color changed to: ${event.target.value}`);
                       if (renderer && scene && camera) renderer.render(scene, camera);
                    }
                 });
              }
              // --- Fin Logique Sol --- 

              // --- Logique Ombres --- 
              const toggleShadowsButton = preview.querySelector('.toggle-shadows-button');
              let shadowsEnabled = false;

              if (toggleShadowsButton) {
                 toggleShadowsButton.addEventListener('click', () => {
                    shadowsEnabled = !shadowsEnabled;
                    renderer.shadowMap.enabled = shadowsEnabled;
                    shadowLight.castShadow = shadowsEnabled;
                    if (hologram.mesh) {
                       hologram.mesh.castShadow = shadowsEnabled;
                    }
                    if (floorMesh) { // Vérifier si le sol existe
                       floorMesh.receiveShadow = shadowsEnabled;
                       // Important: le matériau doit être changé si on utilise ShadowMaterial
                       // if (floorMesh.material instanceof THREE.ShadowMaterial) { /* ne rien faire */ } 
                       // else if (shadowsEnabled) { /* changer pour ShadowMaterial ? */ } 
                       // else { /* Revenir à MeshStandardMaterial ? */ }
                       // Pour l'instant, on suppose MeshStandardMaterial fonctionne pour recevoir
                       if(floorMesh.material) floorMesh.material.needsUpdate = true; // Notifier three.js
                    }
                    console.log(`[Shadows] Toggled shadows to: ${shadowsEnabled}`);
                    // Forcer le rendu
                    if (renderer && scene && camera) renderer.render(scene, camera);
                 });
              }
              // --- Fin Logique Ombres ---

              // --- Logique Keyframes Animation ---
              const addKeyframeButton = preview.querySelector('.add-keyframe-button');
              const clearKeyframesButton = preview.querySelector('.clear-keyframes-button');
              const previewAnimationButton = preview.querySelector('.preview-animation-button');
              const forceNodeUpdateButton = preview.querySelector('.force-node-update-button');
              const keyframeCountDisplay = preview.querySelector('.keyframe-count-display');
              const key = '8i_3d_data';

              const updateKeyframeDisplay = (nodeId) => {
                const data = getLocalData(key);
                const count = data[nodeId]?.keyframes?.length || 0;
                keyframeCountDisplay.innerText = `(${count} Keyframes)`;
                
                // Update preview button state
                if (previewAnimationButton) {
                  previewAnimationButton.disabled = count < 2;
                  previewAnimationButton.style.opacity = count < 2 ? '0.5' : '1';
                }
              };
              
              const forceNodeUpdate = () => {
                  const timestampInput = that.widgets.find(w => w.name === 'upload-preview')?.div?.querySelector('.camera-timestamp-input');
                  if (timestampInput) {
                    const now = Date.now();
                    timestampInput.value = now;
                    console.log(`[Keyframe] Forced node update with timestamp ${now}.`);
                  }
              };

              if (addKeyframeButton) {
                addKeyframeButton.addEventListener('click', () => {
                  let localData = getLocalData(key);
                  if (!localData[that.id]) localData[that.id] = {};
                  if (!localData[that.id].keyframes) localData[that.id].keyframes = [];
                  
                  const controls = hologram.controls;
                  const newKeyframe = {
                    position: { ...controls.object.position },
                    target: { ...controls.target },
                    zoom: controls.object.zoom
                  };
                  
                  localData[that.id].keyframes.push(newKeyframe);
                  setLocalDataOfWin(key, localData);
                  console.log(`[Keyframe] Added keyframe #${localData[that.id].keyframes.length}. Total:`, localData[that.id].keyframes);
                  updateKeyframeDisplay(that.id);
                  
                  // Update play button visual feedback
                  updatePlayButtonState();
                  
                  forceNodeUpdate();
                });
              }

              if (clearKeyframesButton) {
                clearKeyframesButton.addEventListener('click', () => {
                  let localData = getLocalData(key);
                  if (localData[that.id]) {
                    localData[that.id].keyframes = [];
                    setLocalDataOfWin(key, localData);
                    console.log('[Keyframe] All keyframes cleared.');
                  }
                  updateKeyframeDisplay(that.id);
                  
                  // Reset play button visual feedback
                  updatePlayButtonState();
                  
                  forceNodeUpdate();
                });
              }

              // Preview Animation Button
              if (previewAnimationButton) {
                previewAnimationButton.addEventListener('click', () => {
                  const localData = getLocalData(key);
                  const keyframes = localData[that.id]?.keyframes;
                  
                  if (!keyframes || keyframes.length < 2) {
                    alert('Need at least 2 keyframes for animation preview');
                    return;
                  }
                  
                  console.log('[Preview] Starting camera animation preview');
                  previewAnimationButton.disabled = true;
                  previewAnimationButton.innerText = 'Previewing...';
                  
                  // Simple preview: animate between keyframes
                  let currentKeyframe = 0;
                  const previewDuration = 3000; // 3 seconds per keyframe
                  
                  const animateToNextKeyframe = () => {
                    if (currentKeyframe >= keyframes.length - 1) {
                      previewAnimationButton.disabled = false;
                      previewAnimationButton.innerText = 'Preview';
                      console.log('[Preview] Animation preview completed');
                      return;
                    }
                    
                    const startFrame = keyframes[currentKeyframe];
                    const endFrame = keyframes[currentKeyframe + 1];
                    const startTime = Date.now();
                    
                    const animate = () => {
                      const elapsed = Date.now() - startTime;
                      const progress = Math.min(elapsed / previewDuration, 1);
                      
                      // Interpolate camera position
                      const position = {
                        x: startFrame.position.x + (endFrame.position.x - startFrame.position.x) * progress,
                        y: startFrame.position.y + (endFrame.position.y - startFrame.position.y) * progress,
                        z: startFrame.position.z + (endFrame.position.z - startFrame.position.z) * progress
                      };
                      
                      const target = {
                        x: startFrame.target.x + (endFrame.target.x - startFrame.target.x) * progress,
                        y: startFrame.target.y + (endFrame.target.y - startFrame.target.y) * progress,
                        z: startFrame.target.z + (endFrame.target.z - startFrame.target.z) * progress
                      };
                      
                      // Apply to camera
                      hologram.controls.object.position.set(position.x, position.y, position.z);
                      hologram.controls.target.set(target.x, target.y, target.z);
                      hologram.controls.update();
                      
                      if (progress < 1) {
                        requestAnimationFrame(animate);
                      } else {
                        currentKeyframe++;
                        setTimeout(animateToNextKeyframe, 500); // Pause between keyframes
                      }
                    };
                    
                    animate();
                  };
                  
                  animateToNextKeyframe();
                });
              }

              // Force Node Update Button
              if (forceNodeUpdateButton) {
                forceNodeUpdateButton.addEventListener('click', () => {
                  console.log('[ForceUpdate] Forcing node update');
                  forceNodeUpdate();
                  
                  // Visual feedback
                  forceNodeUpdateButton.innerText = 'Updated!';
                  forceNodeUpdateButton.style.background = '#4CAF50';
                  
                  setTimeout(() => {
                    forceNodeUpdateButton.innerText = 'Update Node';
                    forceNodeUpdateButton.style.background = '#9C27B0';
                  }, 1000);
                });
              }
              // --- Fin Logique Keyframes ---

              // Handle background color changes and persistence (improved)
              const handleBgColorChange = (e) => {
                const color = e.target.value
                console.log(`[Background] User changing background color to: ${color}`);
                
                // Use the same robust background application function
                applyBackgroundColor(color);
                
                // Save color to local data
                let localData = getLocalData(key);
                if (!localData[that.id]) localData[that.id] = {}
                localData[that.id].bgColor = color
                setLocalDataOfWin(key, localData)
              }

              bgColorInput.addEventListener('input', handleBgColorChange)
              
              // Initial display update for keyframes and UI state
              updateKeyframeDisplay(that.id);
              
              // Initialize play button visual state
              updatePlayButtonState();

              // Restore saved background color if it exists (improved)
              let localData = getLocalData(key);
              
              if (localData[that.id]?.bgColor) {
                const savedColor = localData[that.id].bgColor
                console.log(`[Background] Restoring saved background color: ${savedColor}`);
                applyBackgroundColor(savedColor);
              } else {
                // Set default black background if no saved color
                console.log('[Background] No saved color, applying default black');
                applyBackgroundColor('#000000');
              }

              // Handle playback control with camera animation detection
              playbackControl.addEventListener('click', () => {
                isPlaying = !isPlaying;
                playIcon.style.display = isPlaying ? 'none' : 'block';
                pauseIcon.style.display = isPlaying ? 'block' : 'none';
                
                // Check if camera animation is active
                const localData = getLocalData(key);
                const hasKeyframes = localData[that.id]?.keyframes?.length > 1;
                
                if (hologram) {
                  if (isPlaying) {
                    hologram.play();
                    // Si on a des keyframes et qu'on démarre la lecture, activer l'animation de caméra
                    if (hasKeyframes && !cameraAnimationEnabled) {
                      console.log('[PlayPause] Starting playback with camera animation');
                    }
                  } else {
                    hologram.player.pause();
                    console.log('[PlayPause] Pausing playback');
                  }
                }
                
                // Update visual feedback using utility function
                updatePlayButtonState();
              });

              // Add animation state change handlers
              hologram.player.addEventListener('seeked', () => {
                console.log('Seeked to time:', hologram.player.currentTime)
              })

              hologram.player.addEventListener('timeupdate', () => {
                // Removed frequent logging to avoid console spam
              })

              // Add enhanced camera controls with keyboard shortcuts
              const addEnhancedCameraControls = () => {
                const canvas = document.getElementById(`hologram-canvas-${that.id}`);
                if (!canvas) return;
                
                // Add keyboard controls for fine camera movement
                const onKeyDown = (event) => {
                  if (!canvas.matches(':hover') && document.activeElement !== canvas) return;
                  
                  const moveSpeed = 0.1;
                  const controls = hologram.controls;
                  
                  switch(event.code) {
                    case 'KeyW': // Move forward
                      controls.object.translateZ(-moveSpeed);
                      break;
                    case 'KeyS': // Move backward
                      controls.object.translateZ(moveSpeed);
                      break;
                    case 'KeyA': // Move left
                      controls.object.translateX(-moveSpeed);
                      break;
                    case 'KeyD': // Move right
                      controls.object.translateX(moveSpeed);
                      break;
                    case 'KeyQ': // Move up
                      controls.object.translateY(moveSpeed);
                      break;
                    case 'KeyE': // Move down
                      controls.object.translateY(-moveSpeed);
                      break;
                  }
                  
                  controls.update();
                  event.preventDefault();
                };
                
                // Add focus handling for keyboard controls
                canvas.addEventListener('mouseenter', () => {
                  document.addEventListener('keydown', onKeyDown);
                });
                
                canvas.addEventListener('mouseleave', () => {
                  document.removeEventListener('keydown', onKeyDown);
                });
                
                // Make canvas focusable
                canvas.tabIndex = 0;
                canvas.style.outline = 'none';
                
                console.log('[CameraControls] Enhanced camera controls added (WASD + QE for movement)');
              };
              
              // Add enhanced controls
              addEnhancedCameraControls();

              // Mettre à jour le timestamp caché lors du changement de caméra OrbitControls
              if (hologram.controls) {
                console.log(`[NODE ${that.id}] Adding 'end' listener to OrbitControls`);
                hologram.controls.addEventListener('end', () => { // Revenir à 'end' pour moins de mises à jour
                  // Trouver l'input caché dans le preview associé à CE noeud (that)
                  const timestampInput = that.widgets.find(w => w.name === 'upload-preview')?.div?.querySelector('.camera-timestamp-input');
                  const controls = hologram.controls; // Récupérer les contrôles

                  if (timestampInput) {
                    // Définir le timestamp actuel
                    const now = Date.now();
                    timestampInput.value = now;
                    console.log(`[NODE ${that.id}] OrbitControls 'end' event fired. Updated hidden timestamp input to ${now}.`);
                    
                    // Stocker l'état actuel de la caméra dans localStorage
                    try {
                      let d = getLocalData('8i_3d_data')
                      if (!d[that.id]) d[that.id] = {}
                      // Cloner les objets pour éviter les références directes
                      d[that.id].cameraState = {
                        type: 'orbit',
                        position: { ...controls.object.position },
                        target: { ...controls.target },
                        zoom: controls.object.zoom // Ajouter le zoom
                      };
                      setLocalDataOfWin('8i_3d_data', d);
                      console.log(`[NODE ${that.id}] Stored OrbitControls camera state.`);
                    } catch (err) {
                      console.error(`[NODE ${that.id}] Error storing OrbitControls camera state:`, err);
                    }

            } else {
                    console.warn(`[NODE ${that.id}] OrbitControls 'end' event fired, but hidden timestamp input not found.`);
                  }
                });
                } else {
                console.warn(`[NODE ${that.id}] Could not add 'end' listener: hologram.controls is missing.`);
                }

                if (thumbUrl) {
                  let tb = await base64ToBlobFromURL(thumbUrl)
                  let tUrl = await uploadImage(tb, '.png')
                  dd[that.id].material = tUrl
                }
                setLocalDataOfWin(key, dd)
              
              // Mettre à jour le widget caché pour forcer l'exécution
              const forceUpdateWidget = that.widgets.find(w => w.name === '_camera_timestamp');
              if (forceUpdateWidget) {
                // Définir le timestamp actuel
                const now = Date.now();
                timestampInput.value = now;
                console.log(`[NODE ${that.id}] ModelViewer camera changed. Updated hidden timestamp input to ${now}.`);
                
                // Stocker aussi l'état caméra de ModelViewer
                try {
                  let d = getLocalData('8i_3d_data') // Recharger pour être sûr
                  if (!d[that.id]) d[that.id] = {}
                  d[that.id].cameraState = {
                    type: 'modelviewer',
                    orbit: modelViewerVariants.cameraOrbit,
                    target: modelViewerVariants.cameraTarget,
                    fieldOfView: modelViewerVariants.getFieldOfView() // Ajouter FoV
                  };
                  setLocalDataOfWin('8i_3d_data', d);
                  console.log(`[NODE ${that.id}] Stored ModelViewer camera state.`);
                } catch (err) {
                   console.error(`[NODE ${that.id}] Error storing ModelViewer camera state:`, err);
                }

                                } else {
                console.warn('Hidden timestamp input not found for ModelViewer update.');
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
        preview.style = ` 
          position: relative; 
          margin-top: 60px;
          display: flex;
          justify-content: center;
          align-items: center;
          background-repeat: no-repeat;
          background-size: contain;`
        let upload = inputDiv('_mixlab_3d_image', '3D Model')
        
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
          // Hauteur = Taille totale - hauteur input MPD/Load (estimée ou fixe?) - hauteur marge - hauteur contrôles bas
          let h = that.size[1] - 150 
          
          // Update preview container
          preview.style = `
            position: relative;
            margin-top: 60px;
            display: flex;
            justify-content: center;
            align-items: center;
            background-repeat: no-repeat;
            background-size: contain;
            width: ${w}px;
            height: ${h}px;
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
      
       // Update keyframe display on graph load
      const keyframeCountDisplay = widget.div.querySelector('.keyframe-count-display');
      if (keyframeCountDisplay) {
        const data = getLocalData('8i_3d_data');
        const count = data[id]?.keyframes?.length || 0;
        keyframeCountDisplay.innerText = `(${count} Keyframes)`;
      }
    }
  }
})

// --- Nouvelle fonction pour charger et appliquer HDR ---
async function loadAndApplyHDR(hdrUrl, scene, renderer, statusCallback) {
  console.log("[HDR Load] Starting load for:", hdrUrl.substring(0, 100) + (hdrUrl.length > 100 ? '...' : ''));
  // Réinitialiser le fond/env avant le chargement
  scene.background = null;
  scene.environment = null;
  statusCallback('loading'); // Informe l'UI qu'on charge

  return new Promise((resolve, reject) => {
    try {
      const loader = new RGBELoader();
      loader.load(hdrUrl, (texture) => {
        console.log("[HDR Load] Texture loaded successfully via RGBELoader.");
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader(); 

        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.needsUpdate = true; // Important pour certaines versions/cas

        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.background = envMap; // Appliquer la texture traitée comme fond
        scene.environment = envMap; // Appliquer comme environnement
        console.log("[HDR Load] Applied texture to scene background and environment.");

        texture.dispose(); 
        pmremGenerator.dispose(); 

        // Vérifier si le renderer et la scene existent toujours
        if (!renderer || !scene) {
           console.error("[HDR Load] Renderer or Scene became unavailable after load.");
           statusCallback('error');
           return reject(new Error("Renderer/Scene lost"));
        }

        // Forcer un re-rendu AVEC la caméra correcte
        const camera = scene.userData.camera; // Récupérer la caméra stockée
        if (scene && renderer && camera) {
            console.log("[HDR Load] Forcing re-render with camera:", camera.uuid);
            renderer.render(scene, camera);
        } else {
             console.warn("[HDR Load] Could not force render after HDR load - missing scene/renderer/camera.");
        }
        
        statusCallback('success'); // Informe l'UI du succès
        resolve(); // Résoudre la promesse en cas de succès

      }, undefined, (error) => {
        console.error("[HDR Load] Error loading HDR texture via RGBELoader:", error);
        statusCallback('error'); // Informe l'UI de l'erreur
        reject(new Error(`RGBELoader error: ${error.message || 'Unknown'}`)); // Rejeter la promesse
      });
    } catch (e) {
      console.error("[HDR Load] Error setting up RGBELoader:", e);
      statusCallback('error'); // Informe l'UI de l'erreur
      reject(e); // Rejeter la promesse
    }
  });
}

