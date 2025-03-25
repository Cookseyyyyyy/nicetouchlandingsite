import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';

interface BouncingObjectsProps {
  objectCount?: number;
  objectSpeed?: number;
  boundarySize?: number; // Used as a multiplier for responsive mode
  interactionRadius?: number;
  repelStrength?: number;
  collisionBounceFactor?: number;
  colorPalette?: string[];
  maxSpeed?: number;
  damping?: number;
  minSpeedForDamping?: number; 
  // Manual boundary settings (if provided, override responsive mode)
  manualBoundaryWidth?: number;
  manualBoundaryHeight?: number;
  manualBoundaryDepth?: number;
  minSize?: number; // Minimum object size
  maxSize?: number; // Maximum object size
  debug?: boolean; // Show debug info
  bloomStrength?: number; // Bloom effect strength
  bloomRadius?: number; // Bloom effect radius
  bloomThreshold?: number; // Bloom effect threshold
}

interface PhysicsObject {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  mass: number;
  originalColor: THREE.Color;
  size: number;
}

const BouncingObjects: React.FC<BouncingObjectsProps> = ({
  objectCount = 25,
  objectSpeed = 0.1,
  boundarySize = 0.9, // Default to 90% of window dimensions
  interactionRadius = 1.5,
  repelStrength = 0.5,
  collisionBounceFactor = 0.7,
  maxSpeed = 0.2,
  damping = 0.98,
  minSpeedForDamping = 0.03,
  manualBoundaryWidth,
  manualBoundaryHeight,
  manualBoundaryDepth,
  minSize = 0.4, // Default minimum size (larger than previous 0.3)
  maxSize = 0.9, // Default maximum size (larger than previous 0.7)
  debug = false,
  bloomStrength = 0.8, // Default bloom strength
  bloomRadius = 0.3, // Default bloom radius
  bloomThreshold = 0.2, // Default bloom threshold
  colorPalette = [
    '#FF4F79', // Bright pink
    '#FF6B5B', // Bright coral
    '#FFD166', // Bright yellow
    '#06D6A0', // Bright mint
    '#118AB2', // Bright blue
    '#9B5DE5', // Bright purple
    '#00F5FF', // Bright cyan
    '#44CF6C', // Bright green
    '#FF9A3E', // Bright orange
    '#F038FF', // Bright magenta
  ]
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const objectsRef = useRef<PhysicsObject[]>([]);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mousePosWorldRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const debugTextRef = useRef<HTMLDivElement | null>(null);
  const boundaryDimensionsRef = useRef({
    width: 0,
    height: 0,
    depth: 0
  });
  const composerRef = useRef<EffectComposer | null>(null);
  
  // Calculate boundary dimensions based on window size or manual settings
  const calculateBoundaryDimensions = () => {
    let width, height, depth;
    
    // Use manual boundary dimensions if provided
    if (manualBoundaryWidth !== undefined && 
        manualBoundaryHeight !== undefined && 
        manualBoundaryDepth !== undefined) {
      width = manualBoundaryWidth;
      height = manualBoundaryHeight;
      depth = manualBoundaryDepth;
      
      if (debug) console.log("Using manual boundary dimensions:", { width, height, depth });
    } else {
      // Otherwise use responsive dimensions based on window size
      width = window.innerWidth * boundarySize;
      height = window.innerHeight * boundarySize;
      // Use the larger of width/height for depth to ensure objects stay visible
      depth = Math.max(width, height) * 0.8;
      
      if (debug) console.log("Using responsive boundary dimensions:", { width, height, depth });
    }
    
    boundaryDimensionsRef.current = {
      width,
      height,
      depth
    };
    
    return { width, height, depth };
  };
  
  // Create and initialize the scene
  const initScene = () => {
    if (!mountRef.current) return;
    
    // Calculate boundary dimensions
    const { width, height, depth } = calculateBoundaryDimensions();
    
    // Create scene with a transparent background
    const scene = new THREE.Scene();
    // Make background transparent/null so CSS shows through
    scene.background = null; // Changed from solid color to transparent
    sceneRef.current = scene;

    // Create perspective camera - adjust to see the full boundary
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    
    // Position camera to ensure objects are visible
    // Move camera back based on boundary size
    const cameraDistance = Math.max(width, height, depth) * 0.75;
    camera.position.z = cameraDistance;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance' 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clear mount point before appending
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Set up post-processing
    setupPostProcessing(renderer, scene, camera);
    
    // Set up OrbitControls for optional interaction
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = cameraDistance * 2;
    // Enable orbit controls in debug mode
    controls.enabled = debug;
    controlsRef.current = controls;

    // Add lights
    addLights(scene);
    
    // Setup debug display if needed
    if (debug) {
      setupDebugDisplay();
    }
    
    // Generate initial objects (we'll spawn them gradually)
    objectsRef.current = [];
    
    // Pre-create some objects immediately for faster visibility
    for (let i = 0; i < 5 && i < objectCount; i++) {
      const newObj = createObject(scene);
      if (newObj) {
        objectsRef.current.push(newObj);
      }
    }
    
    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    
    // Start animation loop
    animate();
    
    console.log("Bouncing objects initialized with dimensions:", boundaryDimensionsRef.current);
  };

  // Setup debug display
  const setupDebugDisplay = () => {
    // Create debug display if in debug mode
    const debugDiv = document.createElement('div');
    debugDiv.style.position = 'fixed';
    debugDiv.style.top = '10px';
    debugDiv.style.left = '10px';
    debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.fontFamily = 'monospace';
    debugDiv.style.fontSize = '12px';
    debugDiv.style.zIndex = '1000';
    debugDiv.style.pointerEvents = 'none';
    
    document.body.appendChild(debugDiv);
    debugTextRef.current = debugDiv;
  };

  // Update debug information
  const updateDebugInfo = () => {
    if (!debug || !debugTextRef.current) return;
    
    const { width, height, depth } = boundaryDimensionsRef.current;
    const objectCount = objectsRef.current.length;
    
    debugTextRef.current.innerHTML = `
      <div>Objects: ${objectCount}</div>
      <div>FPS: ${Math.round(frameCountRef.current / Math.max(1, performance.now() / 1000))}</div>
      <div>Camera Z: ${cameraRef.current?.position.z.toFixed(1)}</div>
      <div>Boundary: ${width.toFixed(0)} x ${height.toFixed(0)} x ${depth.toFixed(0)}</div>
      <div>Mouse: ${mousePosWorldRef.current.x.toFixed(1)}, ${mousePosWorldRef.current.y.toFixed(1)}</div>
    `;
  };

  // Add lighting to the scene
  const addLights = (scene: THREE.Scene) => {
    // Load HDRI environment map for realistic lighting
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('/studio_small_09_1k.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      
      // Set the scene's environment map
      scene.environment = texture;
      
      // Update all existing materials to use the environment map
      objectsRef.current.forEach(obj => {
        const material = obj.mesh.material as THREE.MeshStandardMaterial;
        material.envMap = texture;
        material.needsUpdate = true;
      });
      
      console.log("HDRI environment map loaded");
    });
    
    // We'll still keep some direct lights, but with reduced intensity
    // since the HDRI will provide much of the lighting
    
    // Ambient light with reduced intensity
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Reduced from 0.6
    scene.add(ambientLight);
    
    // Main directional light with shadows
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.5); // Reduced from 0.8
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;
    
    // Configure shadow properties
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    const { width, height, depth } = boundaryDimensionsRef.current;
    const maxDimension = Math.max(width, height, depth) * 0.5;
    
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = maxDimension * 3;
    mainLight.shadow.camera.left = -maxDimension;
    mainLight.shadow.camera.right = maxDimension;
    mainLight.shadow.camera.top = maxDimension;
    mainLight.shadow.camera.bottom = -maxDimension;
    
    scene.add(mainLight);
    
    // Remove the fill and rim lights as the HDRI will provide more natural fill lighting
    
    // Keep the point light near camera for better visibility, but reduced intensity
    const pointLight = new THREE.PointLight(0xffffff, 0.3, 0);
    pointLight.position.set(0, 0, 10);
    scene.add(pointLight);
  };

  // Set up post-processing effects
  const setupPostProcessing = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    // Create a new effect composer
    const composer = new EffectComposer(renderer);
    
    // Add render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add UnrealBloomPass for the glow effect
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );
    composer.addPass(bloomPass);
    
    // Add gamma correction pass for proper color rendering
    const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
    composer.addPass(gammaCorrectionPass);
    
    // Store the composer
    composerRef.current = composer;
    
    console.log("Post-processing effects setup complete");
  };

  // Find a safe spawn position that doesn't collide with existing objects
  const findSafePosition = (objectSize: number): THREE.Vector3 => {
    const existingObjects = objectsRef.current;
    const minDistanceBetweenObjects = objectSize * 2.0; // Reduced from 2.5 to match new collision size
    let position: THREE.Vector3;
    let isSafe = false;
    let attempts = 0;
    const maxAttempts = 50; // Limit to prevent infinite loops
    
    const { width, height, depth } = boundaryDimensionsRef.current;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const halfDepth = depth * 0.5;
    
    // Keep trying until we find a safe position or reach max attempts
    while (!isSafe && attempts < maxAttempts) {
      attempts++;
      
      // Generate random position within the boundary dimensions
      // Bias towards the front of the scene (smaller Z values) for better visibility
      position = new THREE.Vector3(
        (Math.random() * 2 - 1) * halfWidth * 0.8,
        (Math.random() * 2 - 1) * halfHeight * 0.8,
        (Math.random() * 1.5 - 0.5) * halfDepth * 0.8 // Bias towards front
      );
      
      // Check against all existing objects
      isSafe = true;
      for (let i = 0; i < existingObjects.length; i++) {
        const obj = existingObjects[i];
        const distance = position.distanceTo(obj.mesh.position);
        if (distance < minDistanceBetweenObjects + obj.size) {
          isSafe = false;
          break;
        }
      }
      
      // If we found a safe position, return it
      if (isSafe) {
        return position;
      }
    }
    
    // If we couldn't find a safe position after max attempts,
    // use a position further out but still visible
    return new THREE.Vector3(
      (Math.random() * 2 - 1) * halfWidth * 0.7,
      (Math.random() * 2 - 1) * halfHeight * 0.7,
      (Math.random() - 0.5) * halfDepth * 0.5 // More bias towards center-front
    );
  };

  // Create and add a single object to the scene
  const createObject = (scene: THREE.Scene): PhysicsObject | null => {
    if (!scene) return null;
    
    // Available geometry creation functions
    const geometryFunctions = [
      () => new THREE.SphereGeometry(1, 32, 32), // Sphere
      () => new THREE.BoxGeometry(1, 1, 1), // Box
      () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32), // Cylinder
      () => new THREE.TorusGeometry(0.5, 0.2, 16, 32), // Torus (donut)
      () => new THREE.ConeGeometry(0.5, 1, 32), // Cone
      () => new THREE.DodecahedronGeometry(0.7), // Dodecahedron
      () => new THREE.IcosahedronGeometry(0.7), // Icosahedron
      () => new THREE.TetrahedronGeometry(0.7), // Tetrahedron
      () => new THREE.TorusKnotGeometry(0.5, 0.2, 64, 8, 2, 3), // Torus knot
    ];
    
    // Select random geometry
    const geometryIndex = Math.floor(Math.random() * geometryFunctions.length);
    const geometry = geometryFunctions[geometryIndex]();
    
    // Scale geometry randomly - using minSize and maxSize props for greater control
    const scale = minSize + Math.random() * (maxSize - minSize);
    geometry.scale(scale, scale, scale);
    
    // Select random color from palette
    const colorIndex = Math.floor(Math.random() * colorPalette.length);
    const color = new THREE.Color(colorPalette[colorIndex]);
    
    // Create material with improved properties for HDRI lighting
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4, // Lower roughness for more reflections with HDRI
      metalness: 0.3, // Add some metalness for HDRI reflections
      flatShading: false,
      envMapIntensity: 0.8, // Controls strength of environment reflections
      emissive: color.clone().multiplyScalar(0.2) // Slight emissive for glow
    });
    
    // If scene has an environment map, use it for this material
    if (scene.environment) {
      material.envMap = scene.environment;
    }
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Find a safe position that doesn't collide with existing objects
    mesh.position.copy(findSafePosition(scale));
    
    // Random gentle velocity (reduced from original)
    const velocity = new THREE.Vector3(
      (Math.random() * 2 - 1) * objectSpeed * 0.5,
      (Math.random() * 2 - 1) * objectSpeed * 0.5,
      (Math.random() * 2 - 1) * objectSpeed * 0.5
    );
    
    // Calculate mass based on scale (simple approximation)
    const mass = scale * scale * scale;
    
    // Add mesh to scene
    scene.add(mesh);
    
    // Create and return the physics object
    // Use a smaller collision radius (0.7 of the visual scale) for more realistic collisions
    return {
      mesh,
      velocity,
      mass,
      originalColor: color.clone(), // Still storing original color but won't use it for changes
      size: scale * 0.7 // Reduce collision radius to match visual appearance better
    };
  };
  
  // Handle mouse movement for interaction
  const handleMouseMove = (event: MouseEvent) => {
    // Update mouse coordinates (normalized -1 to 1)
    mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update world position of mouse for physics calculations
    updateMouseWorldPosition();
  };
  
  // Calculate mouse position in 3D world space
  const updateMouseWorldPosition = () => {
    if (!cameraRef.current) return;
    
    // Set up raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Calculate the point where the mouse ray intersects with z=0 plane
    const planeZ = 0;
    const planeNormal = new THREE.Vector3(0, 0, 1);
    const planePoint = new THREE.Vector3(0, 0, planeZ);
    
    // Create a plane and calculate intersection with ray
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);
    const intersection = new THREE.Vector3();
    
    if (raycasterRef.current.ray.intersectPlane(plane, intersection)) {
      mousePosWorldRef.current.copy(intersection);
    }
  };

  // Apply speed limit to an object's velocity
  const limitVelocity = (velocity: THREE.Vector3, limit: number): THREE.Vector3 => {
    const speed = velocity.length();
    if (speed > limit) {
      velocity.multiplyScalar(limit / speed);
    }
    return velocity;
  };

  // Animation loop
  const animate = () => {
    if (!sceneRef.current || !rendererRef.current || !cameraRef.current || !composerRef.current) return;
    
    // Update controls
    if (controlsRef.current) {
      controlsRef.current.update();
    }
    
    // Make sure mouse world position is updated
    updateMouseWorldPosition();
    
    // Gradually spawn objects over time instead of all at once
    if (objectsRef.current.length < objectCount && frameCountRef.current % 3 === 0) {
      const newObj = createObject(sceneRef.current);
      if (newObj) {
        objectsRef.current.push(newObj);
      }
    }
    
    // Update object positions based on physics
    updateObjectsPhysics();
    
    // Update debug information if needed
    if (debug && frameCountRef.current % 10 === 0) {
      updateDebugInfo();
    }
    
    // Render the scene using the effect composer
    composerRef.current.render();
    
    // Increment frame counter
    frameCountRef.current++;
    
    // Continue animation
    rafRef.current = requestAnimationFrame(animate);
  };
  
  // Update physics for all objects
  const updateObjectsPhysics = () => {
    const objects = objectsRef.current;
    const mousePos = mousePosWorldRef.current;
    const { width, height, depth } = boundaryDimensionsRef.current;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const halfDepth = depth * 0.5;
    
    // First update positions and boundary collisions
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const mesh = obj.mesh;
      const velocity = obj.velocity;
      
      // Apply mouse repulsion
      const distToMouse = mesh.position.distanceTo(mousePos);
      
      if (distToMouse < interactionRadius) {
        // Calculate repulsion direction
        const repelDir = new THREE.Vector3().subVectors(mesh.position, mousePos).normalize();
        
        // Calculate repulsion strength (stronger when closer)
        const repelStrengthScaled = repelStrength * (1 - distToMouse / interactionRadius);
        
        // Apply force to velocity
        velocity.addScaledVector(repelDir, repelStrengthScaled / obj.mass);
      }
      
      // Apply velocity damping only if above minimum speed threshold
      const currentSpeed = velocity.length();
      if (currentSpeed > minSpeedForDamping) {
        velocity.multiplyScalar(damping);
      } else if (currentSpeed > 0 && currentSpeed < 0.005) {
        // Apply a very slight impulse to prevent complete stopping
        if (Math.random() < 0.02) { // 2% chance per frame
          const randomDir = new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
          ).normalize();
          velocity.addScaledVector(randomDir, 0.01);
        }
      }
      
      // Apply velocity limit
      limitVelocity(velocity, maxSpeed);
      
      // Add a gentle bobbing motion
      mesh.rotation.x += 0.003;
      mesh.rotation.y += 0.005;
      
      // Update position from velocity
      mesh.position.add(velocity);
      
      // Boundary collision detection and response with responsive boundaries
      if (Math.abs(mesh.position.x) > halfWidth) {
        mesh.position.x = Math.sign(mesh.position.x) * halfWidth;
        velocity.x = -velocity.x * collisionBounceFactor;
      }
      
      if (Math.abs(mesh.position.y) > halfHeight) {
        mesh.position.y = Math.sign(mesh.position.y) * halfHeight;
        velocity.y = -velocity.y * collisionBounceFactor;
      }
      
      if (Math.abs(mesh.position.z) > halfDepth) {
        mesh.position.z = Math.sign(mesh.position.z) * halfDepth;
        velocity.z = -velocity.z * collisionBounceFactor;
      }
    }
    
    // Then do object-to-object collision detection and response
    for (let i = 0; i < objects.length; i++) {
      const objA = objects[i];
      const meshA = objA.mesh;
      const radiusA = objA.size;
      
      for (let j = i + 1; j < objects.length; j++) {
        const objB = objects[j];
        const meshB = objB.mesh;
        const radiusB = objB.size;
        
        // Calculate distance between object centers
        const distance = meshA.position.distanceTo(meshB.position);
        const minDistance = radiusA + radiusB;
        
        // Check for collision
        if (distance < minDistance) {
          // Calculate collision normal
          const normal = new THREE.Vector3()
            .subVectors(meshB.position, meshA.position)
            .normalize();
          
          // Calculate relative velocity
          const relativeVelocity = new THREE.Vector3()
            .subVectors(objB.velocity, objA.velocity);
          
          // Calculate velocity along the normal
          const velocityAlongNormal = relativeVelocity.dot(normal);
          
          // Only resolve if objects are moving toward each other
          if (velocityAlongNormal > 0) continue;
          
          // Calculate impulse scalar
          const restitution = collisionBounceFactor; // "bounciness"
          const impulseScalar = -(1 + restitution) * velocityAlongNormal;
          const totalMass = objA.mass + objB.mass;
          
          // Apply impulse based on mass
          objA.velocity.addScaledVector(normal, -impulseScalar * (objB.mass / totalMass));
          objB.velocity.addScaledVector(normal, impulseScalar * (objA.mass / totalMass));
          
          // Apply speed limits after collision
          limitVelocity(objA.velocity, maxSpeed);
          limitVelocity(objB.velocity, maxSpeed);
          
          // Move objects apart to prevent sticking
          const correctionAmount = (minDistance - distance) * 0.5;
          const correction = normal.multiplyScalar(correctionAmount);
          meshA.position.sub(correction);
          meshB.position.add(correction);
        }
      }
    }
  };

  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current || !composerRef.current) return;
    
    // Only recalculate boundary dimensions if we're using responsive mode
    if (manualBoundaryWidth === undefined) {
      calculateBoundaryDimensions();
    }
    
    // Update camera
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    
    // Update renderer size
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    
    // Update composer size
    composerRef.current.setSize(window.innerWidth, window.innerHeight);
  };

  // Clean up resources
  const cleanUp = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    if (rendererRef.current && mountRef.current) {
      mountRef.current.removeChild(rendererRef.current.domElement);
    }
    
    // Remove debug display if it exists
    if (debugTextRef.current) {
      document.body.removeChild(debugTextRef.current);
    }
    
    // Remove event listeners
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);
    
    // Dispose of geometries, materials, and textures
    objectsRef.current.forEach(obj => {
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
    });
    
    // Dispose of composer and related resources
    if (composerRef.current) {
      composerRef.current.dispose();
    }
  };

  // Initialize scene on component mount
  useEffect(() => {
    console.log("BouncingObjects component mounted");
    initScene();
    
    return () => {
      cleanUp();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1, // Behind all content
        pointerEvents: 'none', // Allow interaction with elements behind
      }}
      id="bouncing-objects-container"
    />
  );
};

export default BouncingObjects; 