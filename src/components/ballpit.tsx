import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

interface BallPitProps {
  gridWidth?: number;
  gridHeight?: number;
  gridDepth?: number;
  sphereColor?: string;
}

const BallPit: React.FC<BallPitProps> = ({
  gridWidth = 10,
  gridHeight = 10,
  gridDepth = 2,
  sphereColor = '#4a90e2'
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const spheresRef = useRef<{mesh: THREE.Mesh, body: CANNON.Body, originalMaterial: THREE.Material}[]>([]);
  const worldRef = useRef<CANNON.World | null>(null);
  const containerRef = useRef<{mesh: THREE.Mesh, body: CANNON.Body} | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const isDraggingRef = useRef<boolean>(false);
  const hoveredSphereRef = useRef<number>(-1); // Keep track of currently hovered sphere index
  
  const timeStepRef = useRef<number>(1 / 60);
  const lastCallTimeRef = useRef<number>(0);
  
  // Initialize the scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
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
    
    // Set up physics world
    setupPhysicsWorld();
    
    // Add lights
    addLights(scene);
    
    // Create sphere grid with physics
    createSphereGrid();
    
    // Create container box
    createContainer();
    
    // Add event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    // Start animation loop
    animate();
    
    // Cleanup function
    return () => {
      cleanUp();
    };
  }, []); // Only run once on mount
  
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
  
  // Add lights to the scene
  const addLights = (scene: THREE.Scene) => {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    
    // Add a secondary light from the opposite direction
    const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.7);
    secondaryLight.position.set(-5, -2, -5);
    scene.add(secondaryLight);
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
    
    // Create sphere geometry and material
    const geometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      color: sphereColor,
      shininess: 80
    });
    
    // Create highlight material for hover effect
    const highlightMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff, // White highlight
      emissive: sphereColor,
      emissiveIntensity: 0.6,
      shininess: 100
    });
    
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
          
          // Clone the material to ensure each sphere has its own instance
          const sphereMaterial = material.clone();
          
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
      
      // Reset the material of the previously hovered sphere
      const sphere = spheresRef.current[hoveredSphereRef.current];
      sphere.mesh.material = sphere.originalMaterial;
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
          
          // Create highlight material
          const highlightMaterial = new THREE.MeshPhongMaterial({
            color: sphereColor,
            emissive: sphereColor,
            emissiveIntensity: 0.5,
            shininess: 100
          });
          
          // Apply highlight material
          spheresRef.current[hoveredIndex].mesh.material = highlightMaterial;
        }
      }
    }
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
    if (!cameraRef.current || !rendererRef.current) return;
    
    // Update camera aspect ratio
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    
    // Adjust camera position based on new aspect ratio
    const aspect = window.innerWidth / window.innerHeight;
    const distance = Math.max(15, 15 / aspect);
    cameraRef.current.position.z = distance;
    
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    
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
    
    // Render scene
    if (sceneRef.current && cameraRef.current && rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
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
  
  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', zIndex: -1 }} />;
};

export default BallPit;
