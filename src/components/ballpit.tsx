import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { PMREMGenerator } from 'three';

interface BallPitProps {
  gridWidth?: number;
  gridHeight?: number;
  gridDepth?: number;
}

const BallPit: React.FC<BallPitProps> = ({
  gridWidth = 10,
  gridHeight = 10,
  gridDepth = 2,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const envMapRef = useRef<THREE.Texture | null>(null);
  const rafRef = useRef<number | null>(null);
  const spheresRef = useRef<{mesh: THREE.Mesh, body: CANNON.Body, originalMaterial: THREE.Material, highlightStartTime?: number, isAnimating?: boolean}[]>([]);
  const worldRef = useRef<CANNON.World | null>(null);
  const containerRef = useRef<{mesh: THREE.Mesh, body: CANNON.Body} | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const isDraggingRef = useRef<boolean>(false);
  const hoveredSphereRef = useRef<number>(-1); // Keep track of currently hovered sphere index
  
  const timeStepRef = useRef<number>(1 / 60);
  const lastCallTimeRef = useRef<number>(0);
  const highlightAnimationDuration = 1000; // 1 second in milliseconds
  
  // Bloom control states
  const [bloomStrength, setBloomStrength] = useState<number>(0.15);
  const [bloomRadius, setBloomRadius] = useState<number>(0);
  const [bloomThreshold, setBloomThreshold] = useState<number>(1);
  const [showControls, setShowControls] = useState<boolean>(true);
  
  // Update bloom pass when settings change
  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = bloomStrength;
      bloomPassRef.current.radius = bloomRadius;
      bloomPassRef.current.threshold = bloomThreshold;
    }
  }, [bloomStrength, bloomRadius, bloomThreshold]);
  
  // Initialize the scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = null; // Ensure transparent background
    sceneRef.current = scene;
    
    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    // Position camera to see the entire grid
    // Adjust camera position based on aspect ratio to ensure whole grid is visible
    const aspect = window.innerWidth / window.innerHeight;
    const distance = Math.max(15, 15 / aspect);
    camera.position.z = distance;
    camera.position.y = 2;
    cameraRef.current = camera;
    
    // Create renderer with alpha (transparency) enabled
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Ensure alpha is enabled for transparency
      premultipliedAlpha: false // Better color blending with background
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); // Set clear color with 0 alpha (fully transparent)
    
    // Clear mount point before appending
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Load HDRI environment map
    loadEnvironmentMap(scene, renderer).then(() => {
      // Set up post-processing
      setupPostProcessing(scene, camera, renderer);
      
      // Set up physics world
      setupPhysicsWorld();
      
      // Create sphere grid with physics
      createSphereGrid();
      
      // Create container box
      createContainer();
      
      // Start animation loop
      animate();
    });
    
    // Add event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    // Cleanup function
    return () => {
      cleanUp();
    };
  }, []); // Only run once on mount
  
  // Load HDRI environment map
  const loadEnvironmentMap = async (scene: THREE.Scene, renderer: THREE.WebGLRenderer) => {
    return new Promise<void>((resolve) => {
      const rgbeLoader = new RGBELoader();
      rgbeLoader.setPath('/');
      
      rgbeLoader.load('studio_small_09_1k.hdr', (texture) => {
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        // scene.background = envMap; // Uncomment if you want the HDRI as background
        
        texture.dispose();
        pmremGenerator.dispose();
        
        envMapRef.current = envMap;
        resolve();
      });
    });
  };
  
  // Set up post-processing
  const setupPostProcessing = (scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) => {
    // Create composer
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;
    
    // Add render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add bloom pass
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );
    
    composer.addPass(bloomPass);
    bloomPassRef.current = bloomPass;
  };
  
  // Create the grid of spheres with physics
  const createSphereGrid = () => {
    if (!sceneRef.current || !worldRef.current) return;
    
    // Clear previous spheres if any
    spheresRef.current.forEach((sphere) => {
      if (sceneRef.current) sceneRef.current.remove(sphere.mesh);
      if (worldRef.current) worldRef.current.removeBody(sphere.body);
    });
    spheresRef.current = [];
    
    // Get the visible world dimensions based on camera
    const worldDimensions = getViewportToWorldScale();
    
    // Calculate grid dimensions to match viewport
    const gridWorldWidth = worldDimensions.width * 0.95; // 95% of visible width
    const gridWorldHeight = worldDimensions.height * 0.95; // 95% of visible height
    const gridWorldDepth = Math.min(gridWorldWidth, gridWorldHeight) * 0.3; // Depth based on the smaller dimension
    
    // Calculate spacing between spheres - slightly reduced to allow for more packed arrangement
    const spacingX = gridWorldWidth / (gridWidth * 0.85); // Reduce spacing to fit larger spheres
    const spacingY = gridWorldHeight / (gridHeight * 0.85);
    const spacingZ = gridWorldDepth / (gridDepth * 0.85);
    
    // Use the minimum spacing for the sphere radius but make spheres larger
    const minSpacing = Math.min(spacingX, spacingY, spacingZ);
    const sphereRadius = minSpacing * 0.45; // Increased from 0.35 to 0.45 for larger spheres
    
    // Calculate grid center offset for centering
    const offsetX = -gridWorldWidth / 2 + spacingX / 1.8; // Adjusted to center the packed grid
    const offsetY = -gridWorldHeight / 2 + spacingY / 1.8;
    const offsetZ = -gridWorldDepth / 2 + spacingZ / 1.8;
    
    // Create sphere geometry
    const geometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
    
    // Create three different materials with environment mapping
    // 1. Matte black material
    const matteBlackMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x000000,
      envMap: envMapRef.current,
      envMapIntensity: 0.3 // Low intensity for matte material
    });
    
    // 2. Shiny white material
    const shinyWhiteMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 0.1,
      reflectivity: 0,
      envMap: envMapRef.current,
      envMapIntensity: 0.5 // High intensity for shiny material
    });
    
    // 3. Glowing pink material - enhanced for bloom
    const glowingPinkMaterial = new THREE.MeshStandardMaterial({
      color: 0x56378E,
      roughness: 0.4,
      metalness: 0.4,
      emissive: 0xff69b4,
      emissiveIntensity: 20, // Increased for better bloom effect
      envMap: envMapRef.current,
      envMapIntensity: 0.1 // Medium intensity
    });
    
    // Store materials in an array for random selection
    const materials = [
      matteBlackMaterial,
      shinyWhiteMaterial,
      glowingPinkMaterial
    ];
    
    // Create a grid of spheres with alternating row offsets
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        for (let z = 0; z < gridDepth; z++) {
          // Apply offset to even-numbered rows for a more tightly packed arrangement
          const rowOffset = (y % 2 === 0) ? 0 : spacingX / 2;
          const layerOffset = (z % 2 === 0) ? 0 : spacingZ / 2;
          
          // Calculate position with proper spacing and offset
          const posX = offsetX + x * spacingX + rowOffset;
          const posY = offsetY + y * spacingY;
          const posZ = offsetZ + z * spacingZ + layerOffset;
          
          // Select material with reduced probability for pink glowing spheres (1 in 15)
          let sphereMaterial;
          const materialRoll = Math.random();
          
          if (materialRoll < 1/15) {
            // 1/15 chance for pink glowing material (approximately 6.7%)
            sphereMaterial = glowingPinkMaterial.clone();
          } else {
            // The remaining probability is split between black and white
            // We divide the remaining probability (14/15) equally
            if (Math.random() < 0.5) {
              sphereMaterial = matteBlackMaterial.clone();
            } else {
              sphereMaterial = shinyWhiteMaterial.clone();
            }
          }
          
          // Create Three.js mesh
          const sphere = new THREE.Mesh(geometry, sphereMaterial);
          sphere.position.set(posX, posY, posZ);
          sceneRef.current.add(sphere);
          
          // Create physics body
          const sphereBody = new CANNON.Body({
            mass: 1, // Non-zero mass for dynamic bodies
            shape: new CANNON.Sphere(sphereRadius),
            position: new CANNON.Vec3(posX, posY, posZ),
            material: new CANNON.Material({ 
              friction: 0.2,
              restitution: 0.8 // Bounciness
            })
          });
          
          // Add some damping to make the simulation more stable
          sphereBody.linearDamping = 0.08; // Reduced for more movement
          sphereBody.angularDamping = 0.08;
          
          // Add random initial velocity to make the scene more dynamic
          const velMagnitude = 1.2; // Increased from 0.5 for more movement
          sphereBody.velocity.set(
            (Math.random() - 0.5) * velMagnitude,
            (Math.random() - 0.5) * velMagnitude,
            (Math.random() - 0.5) * velMagnitude
          );
          
          // Add a slight random rotation
          sphereBody.angularVelocity.set(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
          );
          
          worldRef.current.addBody(sphereBody);
          
          // Store references to both mesh and body
          spheresRef.current.push({
            mesh: sphere,
            body: sphereBody,
            originalMaterial: sphereMaterial
          });
        }
      }
    }
  };
  
  // Update animation of highlighting spheres
  const updateHighlightAnimations = () => {
    const currentTime = performance.now();
    
    spheresRef.current.forEach((sphere, index) => {
      if (sphere.isAnimating && sphere.highlightStartTime) {
        const elapsedTime = currentTime - sphere.highlightStartTime;
        const progress = Math.min(elapsedTime / highlightAnimationDuration, 1);
        
        if (progress < 1) {
          // Get the current material
          const material = sphere.mesh.material as THREE.MeshStandardMaterial | 
                                                THREE.MeshPhysicalMaterial;
          
          // Calculate the interpolated emissive intensity
          // Start from 50 (highlight) and reduce to original value
          if (material.emissiveIntensity !== undefined) {
            const originalIntensity = sphere.originalMaterial instanceof THREE.MeshStandardMaterial ? 
                                    sphere.originalMaterial.emissiveIntensity || 0 : 0;
            
            const targetIntensity = 50; // Peak highlight intensity
            material.emissiveIntensity = targetIntensity - (progress * (targetIntensity - originalIntensity));
          }
        } else {
          // Animation complete, restore original material
          sphere.mesh.material = sphere.originalMaterial;
          sphere.isAnimating = false;
          sphere.highlightStartTime = undefined;
          
          // If this is the hovered sphere that just finished animating,
          // reset the hover state to avoid flicker
          if (hoveredSphereRef.current === index) {
            hoveredSphereRef.current = -1;
          }
        }
      }
    });
  };
  
  // Check for spheres under the mouse cursor and update hover state
  const checkSphereHover = () => {
    if (!cameraRef.current || !sceneRef.current) return;
    
    // Update the raycaster with mouse position
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Find intersections with spheres
    const meshes = spheresRef.current.map(item => item.mesh);
    const intersects = raycasterRef.current.intersectObjects(meshes);
    
    // Reset previously hovered sphere if it's not being hovered anymore
    if (hoveredSphereRef.current !== -1 && 
        (intersects.length === 0 || 
         meshes[hoveredSphereRef.current].id !== intersects[0].object.id)) {
      
      // Start animation for the previously hovered sphere
      const sphere = spheresRef.current[hoveredSphereRef.current];
      sphere.isAnimating = true;
      sphere.highlightStartTime = performance.now();
      
      // No need to reset material immediately as it will animate
      hoveredSphereRef.current = -1;
    }
    
    // Update hover state for currently hovered sphere
    if (intersects.length > 0) {
      const hoveredIndex = meshes.findIndex(mesh => mesh.id === intersects[0].object.id);
      
      if (hoveredIndex !== -1) {
        // Apply force to the hovered sphere (even if it's already hovered)
        const sphereBody = spheresRef.current[hoveredIndex].body;
        
        // Calculate force direction from camera to intersection point
        const forceDirection = new CANNON.Vec3();
        forceDirection.copy(raycasterRef.current.ray.direction as any);
        
        // Scale force magnitude - using smaller magnitude for hover to avoid excessive movement
        const forceMagnitude = 8;
        forceDirection.scale(forceMagnitude, forceDirection);
        
        // Apply the impulse at the point of intersection
        const relativePoint = new CANNON.Vec3();
        sphereBody.applyImpulse(forceDirection, relativePoint);
        
        // Also apply some random force to nearby spheres for chain reaction
        spheresRef.current.forEach((sphere, index) => {
          if (index !== hoveredIndex) {
            const distance = sphere.body.position.distanceTo(sphereBody.position);
            if (distance < 3) { // Affect nearby spheres
              const randomForce = new CANNON.Vec3(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3
              );
              sphere.body.applyImpulse(randomForce, new CANNON.Vec3());
            }
          }
        });
        
        // Only update material if it's a new hover
        if (hoveredIndex !== hoveredSphereRef.current) {
          // Set the new hovered sphere
          hoveredSphereRef.current = hoveredIndex;
          
          // Get the original material to determine its type for appropriate highlighting
          const originalMaterial = spheresRef.current[hoveredIndex].originalMaterial;
          let highlightMaterial;
          
          // Create appropriate highlight material based on the original material type
          if ((originalMaterial as THREE.Material).name.includes('MeshStandard') && 
              (originalMaterial as THREE.MeshStandardMaterial).color.getHex() === 0x000000) {
            // For matte black
            highlightMaterial = new THREE.MeshStandardMaterial({
              color: 0x333333,
              roughness: 0.7,
              metalness: 0.3,
              emissive: 0x222222,
              emissiveIntensity: 50,
              envMap: envMapRef.current,
              envMapIntensity: 0.5
            });
          } else if ((originalMaterial as THREE.Material).name.includes('MeshPhysical')) {
            // For shiny white
            highlightMaterial = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: 0.05,
              metalness: 0.9,
              clearcoat: 0.8,
              reflectivity: 1.0,
              emissive: 0xaaaaaa,
              emissiveIntensity: 50,
              envMap: envMapRef.current,
              envMapIntensity: 1.5
            });
          } else {
            // For glowing pink - enhanced highlight for bloom
            highlightMaterial = new THREE.MeshStandardMaterial({
              color: 0xff69b4,
              roughness: 0.3,
              metalness: 0.5,
              emissive: 0xff69b4,
              emissiveIntensity: 50, // Increased intensity for hover
              envMap: envMapRef.current,
              envMapIntensity: 0.8
            });
          }
          
          // Cancel any running animation for this sphere
          spheresRef.current[hoveredIndex].isAnimating = false;
          
          // Apply highlight material
          spheresRef.current[hoveredIndex].mesh.material = highlightMaterial;
        }
      }
    }
  };
  
  // Convert viewport coordinates to Three.js world coordinates
  const getViewportToWorldScale = () => {
    if (!cameraRef.current) return { width: 10, height: 10 };
    
    // Calculate the visible width and height at the z=0 plane
    const camera = cameraRef.current;
    const fov = camera.fov * (Math.PI / 180); // Convert to radians
    const distance = Math.abs(camera.position.z);
    
    // Get visible height at the z=0 plane
    const visibleHeight = 2 * Math.tan(fov / 2) * distance;
    
    // Get visible width using aspect ratio
    const visibleWidth = visibleHeight * camera.aspect;
    
    return { width: visibleWidth, height: visibleHeight };
  };
  
  // Set up physics world
  const setupPhysicsWorld = () => {
    // Create a physics world
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -5, 0) // Reduced gravity for a more floaty effect
    });
    
    // Set default contact material properties
    world.defaultContactMaterial.restitution = 0.8; // Increased bounciness
    world.defaultContactMaterial.friction = 0.2;  // Reduced friction
    
    worldRef.current = world;
  };
  
  // Create container box
  const createContainer = () => {
    if (!sceneRef.current || !worldRef.current) return;
    
    // Get the visible world dimensions based on camera
    const worldDimensions = getViewportToWorldScale();
    
    // Calculate container dimensions (match viewport size with slight adjustment for the packed grid)
    const containerWidth = worldDimensions.width * 0.9; // 90% of visible width
    const containerHeight = worldDimensions.height * 0.9; // 90% of visible height
    const containerDepth = Math.min(containerWidth, containerHeight) * 0.3; // Depth based on the smaller dimension
    
    // Create invisible box geometry for visualization (wireframe)
    const boxGeometry = new THREE.BoxGeometry(
      containerWidth, 
      containerHeight, 
      containerDepth
    );
    
    const boxMaterial = new THREE.MeshBasicMaterial({ 
      wireframe: true, 
      visible: false, // Set to true for debugging
      color: 0xffffff 
    });
    
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    sceneRef.current.add(boxMesh);
    
    // Create physics body for container
    const halfWidth = containerWidth / 2;
    const halfHeight = containerHeight / 2;
    const halfDepth = containerDepth / 2;
    
    // Create physics body - we use planes for the container walls
    const boxBody = new CANNON.Body({ 
      type: CANNON.Body.STATIC,
      mass: 0 // Static body
    });
    
    // Add box planes (inward facing normals)
    // Bottom
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(0, -halfHeight, 0), 
      new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
    );
    
    // Top
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(0, halfHeight, 0), 
      new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)
    );
    
    // Left
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(-halfWidth, 0, 0), 
      new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0)
    );
    
    // Right
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(halfWidth, 0, 0), 
      new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0)
    );
    
    // Front
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(0, 0, -halfDepth), 
      new CANNON.Quaternion().setFromEuler(0, 0, 0)
    );
    
    // Back
    boxBody.addShape(
      new CANNON.Plane(), 
      new CANNON.Vec3(0, 0, halfDepth), 
      new CANNON.Quaternion().setFromEuler(0, Math.PI, 0)
    );
    
    worldRef.current.addBody(boxBody);
    
    containerRef.current = {
      mesh: boxMesh,
      body: boxBody
    };
  };
  
  // Update mouse coordinates for raycaster
  const updateMouseCoordinates = (clientX: number, clientY: number) => {
    if (!rendererRef.current) return;
    
    const canvas = rendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate normalized device coordinates (-1 to +1)
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };
  
  // Apply force to the spheres
  const applyForceToSpheres = () => {
    if (!cameraRef.current || !sceneRef.current) return;
    
    // Update the raycaster with mouse position
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Find intersections with spheres
    const meshes = spheresRef.current.map(item => item.mesh);
    const intersects = raycasterRef.current.intersectObjects(meshes);
    
    if (intersects.length > 0) {
      // Apply force to the clicked/touched sphere
      const clickedIndex = meshes.findIndex(mesh => mesh.id === intersects[0].object.id);
      
      if (clickedIndex !== -1) {
        const sphereBody = spheresRef.current[clickedIndex].body;
        
        // Calculate force direction from camera to intersection point
        const forceDirection = new CANNON.Vec3();
        forceDirection.copy(raycasterRef.current.ray.direction as any);
        
        // Scale force magnitude (increased for more dramatic effect)
        const forceMagnitude = 15;
        forceDirection.scale(forceMagnitude, forceDirection);
        
        // Apply the impulse at the point of intersection
        const relativePoint = new CANNON.Vec3();
        sphereBody.applyImpulse(forceDirection, relativePoint);
        
        // Also apply some random force to nearby spheres for chain reaction
        spheresRef.current.forEach((sphere, index) => {
          if (index !== clickedIndex) {
            const distance = sphere.body.position.distanceTo(sphereBody.position);
            if (distance < 4) { // Increased distance for affecting more nearby spheres
              const randomForce = new CANNON.Vec3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6
              );
              sphere.body.applyImpulse(randomForce, new CANNON.Vec3());
            }
          }
        });
      }
    }
  };
  
  // Event handlers
  const handleMouseDown = (event: MouseEvent) => {
    // Check if the event target is not a control element
    const target = event.target as HTMLElement;
    if (target.closest('.bloom-controls')) {
      return;
    }
    
    updateMouseCoordinates(event.clientX, event.clientY);
    isDraggingRef.current = true;
    // We'll still keep the click functionality for a stronger push
    applyForceToSpheres();
  };
  
  const handleMouseMove = (event: MouseEvent) => {
    updateMouseCoordinates(event.clientX, event.clientY);
    
    // Check for hover and apply forces
    checkSphereHover();
    
    // No longer need to check for dragging since we apply forces on hover
  };
  
  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };
  
  const handleTouchStart = (event: TouchEvent) => {
    // Check if the event target is not a control element
    const target = event.target as HTMLElement;
    if (target.closest('.bloom-controls')) {
      return;
    }
    
    event.preventDefault();
    if (event.touches.length > 0) {
      updateMouseCoordinates(event.touches[0].clientX, event.touches[0].clientY);
      isDraggingRef.current = true;
      applyForceToSpheres();
    }
  };
  
  const handleTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    if (isDraggingRef.current && event.touches.length > 0) {
      updateMouseCoordinates(event.touches[0].clientX, event.touches[0].clientY);
      applyForceToSpheres();
    }
  };
  
  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };
  
  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current || !composerRef.current || !bloomPassRef.current) return;
    
    // Update camera aspect ratio
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    
    // Adjust camera position based on new aspect ratio
    const aspect = window.innerWidth / window.innerHeight;
    const distance = Math.max(15, 15 / aspect);
    cameraRef.current.position.z = distance;
    
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    
    // Update composer size
    composerRef.current.setSize(window.innerWidth, window.innerHeight);
    
    // Update bloom pass resolution
    bloomPassRef.current.resolution.set(window.innerWidth, window.innerHeight);
    
    // Reset the hover state when resizing
    if (hoveredSphereRef.current !== -1) {
      const sphere = spheresRef.current[hoveredSphereRef.current];
      sphere.mesh.material = sphere.originalMaterial;
      hoveredSphereRef.current = -1;
    }
    
    // Recreate the sphere grid to maintain proper scaling
    if (worldRef.current) {
      // Remove existing objects
      if (containerRef.current) {
        worldRef.current.removeBody(containerRef.current.body);
        if (sceneRef.current) sceneRef.current.remove(containerRef.current.mesh);
      }
      
      // Recreate container and spheres
      createSphereGrid();
      createContainer();
    }
  };
  
  // Animation loop with physics
  const animate = () => {
    rafRef.current = requestAnimationFrame(animate);
    
    if (worldRef.current) {
      // Get time since last call
      const time = performance.now() / 1000; // Convert to seconds
      const dt = lastCallTimeRef.current ? time - lastCallTimeRef.current : 0;
      lastCallTimeRef.current = time;
      
      // Step the physics world
      worldRef.current.step(timeStepRef.current, dt, 3);
      
      // Update Three.js meshes with Cannon.js body positions
      spheresRef.current.forEach(object => {
        object.mesh.position.copy(object.body.position as any);
        object.mesh.quaternion.copy(object.body.quaternion as any);
      });
    }
    
    // Update highlight animations
    updateHighlightAnimations();
    
    // Render scene using composer
    if (sceneRef.current && cameraRef.current && composerRef.current) {
      composerRef.current.render();
    }
  };
  
  // Cleanup
  const cleanUp = () => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleTouchEnd);
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    if (mountRef.current && rendererRef.current) {
      mountRef.current.removeChild(rendererRef.current.domElement);
    }
    
    // Dispose of Three.js resources
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    
    if (composerRef.current) {
      composerRef.current.dispose();
    }
    
    if (envMapRef.current) {
      envMapRef.current.dispose();
    }
    
    // Remove all objects from the world
    if (worldRef.current) {
      spheresRef.current.forEach(object => {
        worldRef.current?.removeBody(object.body);
      });
      
      if (containerRef.current) {
        worldRef.current.removeBody(containerRef.current.body);
      }
    }
    
    spheresRef.current.forEach((object) => {
      if (sceneRef.current) sceneRef.current.remove(object.mesh);
      object.mesh.geometry.dispose();
      
      // Dispose of both original and potentially modified materials
      if (object.originalMaterial) {
        (object.originalMaterial as THREE.Material).dispose();
      }
      if (object.mesh.material instanceof THREE.Material) {
        object.mesh.material.dispose();
      }
    });
    
    if (containerRef.current && sceneRef.current) {
      sceneRef.current.remove(containerRef.current.mesh);
      containerRef.current.mesh.geometry.dispose();
      (containerRef.current.mesh.material as THREE.Material).dispose();
    }
    
    spheresRef.current = [];
    containerRef.current = null;
  };
  
  // Toggle controls visibility
  const toggleControls = () => {
    setShowControls(!showControls);
  };
  
  return (
    <>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', zIndex: -1 }} />
      
      {/* Bloom Controls */}
      {/* <div className="bloom-controls" style={{
        position: 'fixed',
        bottom: showControls ? '20px' : '-250px',
        right: '20px',
        background: 'rgba(0,0,0,0.7)',
        padding: '15px',
        borderRadius: '8px',
        color: 'white',
        zIndex: 1000,
        transition: 'bottom 0.3s ease-in-out',
        width: '250px'
      }}>
        <button 
          onClick={toggleControls}
          style={{
            position: 'absolute',
            top: '-30px',
            right: '0',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '5px 10px',
            cursor: 'pointer'
          }}
        >
          {showControls ? 'Hide Controls' : 'Show Controls'}
        </button>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Bloom Strength: {bloomStrength.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={bloomStrength}
            onChange={(e) => setBloomStrength(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Bloom Radius: {bloomRadius.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={bloomRadius}
            onChange={(e) => setBloomRadius(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Bloom Threshold: {bloomThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={bloomThreshold}
            onChange={(e) => setBloomThreshold(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div> */}
    </>
  );
};

export default BallPit;
