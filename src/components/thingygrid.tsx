import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ThingGridProps {
  rows?: number;
  columns?: number;
  objectScale?: number;
  spacing?: number;
  modelPath?: string;
  rotationSpeed?: number;
  debug?: boolean;
}

const ThingGrid: React.FC<ThingGridProps> = ({
  rows = 3,
  columns = 3,
  objectScale = 0.002,
  spacing = 2.0,
  modelPath = '/thingy.glb',
  rotationSpeed = 0.00,
  debug = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelsRef = useRef<THREE.Group[]>([]);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  // Initialize the scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
    sceneRef.current = scene;
    
    // Setup camera with fixed position
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    // Set a completely fixed camera position that doesn't depend on grid size
    // This ensures consistent view regardless of grid configuration
    camera.position.z = 10;
    
    if (debug) {
      console.log(`Camera positioned at fixed z=${camera.position.z}`);
    }
    
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Clear mount point before appending
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Set up orbit controls with a wider zoom range
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enabled = true;
    controls.minDistance = 2; // Allow zooming in closer
    controls.maxDistance = 50; // Allow zooming out further
    controlsRef.current = controls;
    
    // Add lights
    addLights(scene);
    
    // Load model and create grid
    loadModelAndCreateGrid();
    
    // Add event listener for window resize
    window.addEventListener('resize', handleResize);
    
    // Start animation loop
    animate();
    
    // Cleanup function
    return () => {
      cleanUp();
    };
  }, [modelPath, debug]); // Only re-run if model path or debug changes
  
  // Separate effect to update grid when grid properties change
  useEffect(() => {
    if (sceneRef.current) {
      loadModelAndCreateGrid();
    }
  }, [rows, columns, spacing, objectScale, rotationSpeed]);
  
  // Add lights to the scene
  const addLights = (scene: THREE.Scene) => {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Add a secondary light from the opposite direction
    const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.7);
    secondaryLight.position.set(-5, -2, -5);
    scene.add(secondaryLight);
  };
  
  // Load the 3D model and create the grid
  const loadModelAndCreateGrid = () => {
    if (!sceneRef.current) return;
    
    const loader = new GLTFLoader();
    
    loader.load(
      modelPath,
      (gltf) => {
        if (!sceneRef.current) return;
        
        // Clear previous models if any
        modelsRef.current.forEach((model) => {
          if (sceneRef.current) sceneRef.current.remove(model);
        });
        modelsRef.current = [];
        
        // Calculate grid center offset for centering
        const gridWidth = (columns - 1) * spacing;
        const gridHeight = (rows - 1) * spacing;
        const offsetX = -gridWidth / 2;
        const offsetY = -gridHeight / 2;
        
        if (debug) {
          console.log(`Grid dimensions: ${gridWidth}x${gridHeight}`);
          console.log(`Grid offset: ${offsetX},${offsetY}`);
        }
        
        // Create a grid of models
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < columns; col++) {
            // Clone the loaded model
            const modelClone = gltf.scene.clone();
            
            // Apply scale - this is the only place scale should be set
            modelClone.scale.set(objectScale, objectScale, objectScale);
            
            // Position in grid
            modelClone.position.x = offsetX + col * spacing;
            modelClone.position.y = offsetY + row * spacing;
            
            // Add to scene and keep reference
            sceneRef.current.add(modelClone);
            modelsRef.current.push(modelClone);
          }
        }
        
        setModelLoaded(true);
        
        if (debug) {
          console.log(`Grid created with ${rows}x${columns} models, scale=${objectScale}, spacing=${spacing}`);
        }
      },
      (progress) => {
        if (debug) {
          console.log(`Loading model: ${Math.round(progress.loaded / progress.total * 100)}%`);
        }
      },
      (error) => {
        console.error('Error loading model:', error);
      }
    );
  };
  
  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current) return;
    
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  };
  
  // Animation loop
  const animate = () => {
    rafRef.current = requestAnimationFrame(animate);
    
    // Rotate models
    modelsRef.current.forEach((model) => {
      model.rotation.y += rotationSpeed;
    });
    
    // Update controls
    if (controlsRef.current) {
      controlsRef.current.update();
    }
    
    // Render scene
    if (sceneRef.current && cameraRef.current && rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };
  
  // Cleanup
  const cleanUp = () => {
    window.removeEventListener('resize', handleResize);
    
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
    
    modelsRef.current.forEach((model) => {
      if (sceneRef.current) sceneRef.current.remove(model);
    });
    modelsRef.current = [];
  };
  
  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', zIndex: -1 }} />;
};

export default ThingGrid;
