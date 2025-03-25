import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

interface DataStreamProps {
  // Configuration parameters
  particleCount?: number;       // Number of particles
  particleSpeed?: number;       // Overall particle speed
  particleSize?: number;        // Size of particles
  particleOpacity?: number;     // Transparency of particles
  interactionRadius?: number;   // How far mouse influence extends
  interactionStrength?: number; // How strongly particles respond
  colorBase?: string;           // Base color
  colorAccent?: string;         // Accent color
  glowStrength?: number;        // Strength of glow effect
}

const DataStream: React.FC<DataStreamProps> = ({
  particleCount = 10000,
  particleSpeed = 0.2,
  particleSize = 1.5,
  particleOpacity = 0.6,
  interactionRadius = 0.15,
  interactionStrength = 1.0,
  colorBase = '#e0e7ff',       // Very light indigo
  colorAccent = '#818cf8',     // Medium indigo
  glowStrength = 0.35
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const lastMouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const mouseVelocityRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const rafRef = useRef<number | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  
  // Simulation properties
  const timeStepRef = useRef<number>(0.016); // 60fps
  const velocitiesRef = useRef<Float32Array | null>(null);
  const accelerationsRef = useRef<Float32Array | null>(null);
  const originalPositionsRef = useRef<Float32Array | null>(null);
  const flowFieldRef = useRef<THREE.DataTexture | null>(null);
  
  // Initialize noise for fluid motion
  const simplex = {
    noise2D: (x: number, y: number) => {
      // Simple 2D noise function using sine waves for organic motion
      return Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 + 
             Math.sin(x * 0.2 + y * 0.3) * 0.3 +
             Math.cos(x * 0.1 + y * 0.5 + 0.8) * 0.2;
    }
  };

  // Handle mouse movement
  const handleMouseMove = (event: MouseEvent) => {
    // Store previous mouse position
    lastMouseRef.current.copy(mouseRef.current);
    
    // Update to new position (normalized coordinates)
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    mouseRef.current.set(x, y);
    
    // Calculate mouse velocity for more dynamic interaction
    mouseVelocityRef.current.subVectors(mouseRef.current, lastMouseRef.current);
  };

  // Create and initialize the scene
  const initScene = () => {
    if (!mountRef.current) return;
    
    // Get container dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Create scene
    const scene = new THREE.Scene();
    // Use a subtle gradient background
    const bgColor = new THREE.Color('#070b25');
    scene.background = bgColor;
    sceneRef.current = scene;

    // Create camera - moved farther back for better particle visibility
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.z = 5; // Moved back for a wider view of the particles
    cameraRef.current = camera;

    // Create renderer with high quality settings
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Clear the mount element before appending
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Generate the particle system
    createParticleSystem(width, height);
    
    // Create post-processing effects
    setupPostProcessing(renderer, scene, camera);
    
    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    
    // Start animation loop
    clockRef.current.start();
    animate();
    
    console.log("Fluid particle system initialized");
  };

  // Create a custom shader for particles with glow and fluid-like appearance
  const createParticleSystem = (width: number, height: number) => {
    if (!sceneRef.current) return;
    
    // Create particle geometry
    const particleGeometry = new THREE.BufferGeometry();
    
    // Create positions and random attributes for variation
    const positions = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);
    
    // Initialize velocities and accelerations arrays for physics
    velocitiesRef.current = new Float32Array(particleCount * 3);
    accelerationsRef.current = new Float32Array(particleCount * 3);
    originalPositionsRef.current = new Float32Array(particleCount * 3);
    
    // Create flow field (defines the general motion pattern)
    const flowFieldSize = 128;
    const flowFieldData = new Uint8Array(flowFieldSize * flowFieldSize * 4);
    
    for (let y = 0; y < flowFieldSize; y++) {
      for (let x = 0; x < flowFieldSize; x++) {
        const i = (y * flowFieldSize + x) * 4;
        
        // Use noise to create a natural-looking flow field
        const angle = simplex.noise2D(x * 0.04, y * 0.04) * Math.PI * 2;
        
        // Store angle as directional vector in RG channels
        flowFieldData[i] = Math.floor(((Math.cos(angle) * 0.5) + 0.5) * 255);
        flowFieldData[i + 1] = Math.floor(((Math.sin(angle) * 0.5) + 0.5) * 255);
        flowFieldData[i + 2] = 0;  // Not used
        flowFieldData[i + 3] = 255; // Alpha
      }
    }
    
    flowFieldRef.current = new THREE.DataTexture(
      flowFieldData,
      flowFieldSize,
      flowFieldSize,
      THREE.RGBAFormat
    );
    flowFieldRef.current.needsUpdate = true;
    
    // Color base and accent for gradient
    const baseColor = new THREE.Color(colorBase);
    const accentColor = new THREE.Color(colorAccent);
    
    // Distribute particles in a wave pattern across the screen
    const aspect = width / height;
    
    // Increased distribution range for a more spread out field
    const distributionRange = 4.0; // Wider spread across the viewport
    
    for (let i = 0; i < particleCount; i++) {
      // More dense in the center, spreading out to the edges
      const theta = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.5) * distributionRange; 
      
      // Convert polar to cartesian coordinates, adjusted for aspect ratio
      let x = r * Math.cos(theta);
      let y = r * Math.sin(theta) / aspect;
      
      // Add some height variation with wave patterns (more pronounced)
      const waveOffset = Math.sin(x * 3) * 0.15 + Math.cos(y * 2) * 0.15;
      y += waveOffset;
      
      // Store positions
      const idx = i * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      // Add a small z variation for depth
      positions[idx + 2] = (Math.random() - 0.5) * 0.8; 
      
      // Store original positions for resetting
      originalPositionsRef.current[idx] = x;
      originalPositionsRef.current[idx + 1] = y;
      originalPositionsRef.current[idx + 2] = positions[idx + 2];
      
      // Initialize velocities with slight variations
      velocitiesRef.current[idx] = (Math.random() - 0.5) * 0.001 * particleSpeed;
      velocitiesRef.current[idx + 1] = (Math.random() - 0.5) * 0.001 * particleSpeed;
      velocitiesRef.current[idx + 2] = (Math.random() - 0.5) * 0.0005 * particleSpeed;
      
      // Random values for variation in movement and appearance
      randoms[i] = Math.random();
      
      // Larger and more varied sizes for better visibility
      sizes[i] = (1.0 + Math.random() * 1.0) * particleSize * 1.5;
      
      // Mix between base and accent colors for variation
      // Using more biased distribution to get more pronounced color variation
      const colorMix = Math.pow(Math.random(), 0.7); // Bias toward base color
      const particleColor = new THREE.Color().lerpColors(baseColor, accentColor, colorMix);
      colors[idx] = particleColor.r;
      colors[idx + 1] = particleColor.g;
      colors[idx + 2] = particleColor.b;
    }
    
    // Set geometry attributes
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('random', new THREE.BufferAttribute(randoms, 1));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Custom shader material for particles - improved for better visibility
    const particlesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        opacity: { value: particleOpacity }
      },
      vertexShader: `
        attribute float random;
        attribute float size;
        attribute vec3 color;
        
        uniform float time;
        uniform float pixelRatio;
        
        varying vec3 vColor;
        varying float vRandom;
        
        void main() {
          vColor = color;
          vRandom = random;
          
          // Project position
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          
          // Add subtle z-oscillation for depth
          float zOffset = sin(time * random * 2.0 + position.x * 5.0 + position.y * 5.0) * 0.08;
          mvPosition.z += zOffset;
          
          // Size attenuation (smaller when further away, but not as drastic)
          gl_PointSize = size * pixelRatio * (0.7 / -mvPosition.z);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float opacity;
        
        varying vec3 vColor;
        varying float vRandom;
        
        void main() {
          // Create a soft, circular particle with sharper edges
          float distToCenter = length(gl_PointCoord - vec2(0.5));
          if (distToCenter > 0.5) discard; // Circular shape
          
          // Sharper edges for better definition
          float alpha = opacity * smoothstep(0.5, 0.35, distToCenter);
          
          // More pronounced glowing center
          float glow = 1.0 - distToCenter * 2.0;
          glow = pow(glow, 1.5) * 0.7; // Higher power for more concentrated glow
          
          // Combine color with more intense glow
          vec3 finalColor = vColor + glow * 0.6;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    
    // Create the particle system and add to scene
    const particles = new THREE.Points(particleGeometry, particlesMaterial);
    sceneRef.current.add(particles);
    particlesRef.current = particles;
  };

  // Setup post-processing effects
  const setupPostProcessing = (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) => {
    // Basic render pass
    const renderScene = new RenderPass(scene, camera);
    
    // Add bloom effect with adjusted parameters for clearer particles
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      glowStrength,   // Strength 
      0.5,            // Radius - smaller for tighter bloom
      0.8             // Threshold - higher for more targeted glow
    );
    
    // Setup composer
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    
    composerRef.current = composer;
  };

  // Update particle positions and velocities
  const updateParticles = (deltaTime: number) => {
    if (!particlesRef.current || !velocitiesRef.current || !accelerationsRef.current) return;
    
    const positions = (particlesRef.current.geometry.getAttribute('position') as THREE.BufferAttribute).array;
    const velocities = velocitiesRef.current;
    const accelerations = accelerationsRef.current;
    const originalPositions = originalPositionsRef.current;
    
    // Reset accelerations
    for (let i = 0; i < accelerations.length; i++) {
      accelerations[i] = 0;
    }
    
    // Get mouse world position for interaction - scaled for better interaction with new camera position
    const mouseWorldX = mouseRef.current.x * 3.0;
    const mouseWorldY = mouseRef.current.y * 3.0;
    
    // Apply forces and update positions for each particle
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];
      
      // Force 1: Flow field influence - creates overall fluid motion
      // Map particle position to flow field coordinates
      const flowX = Math.floor(((x + 4.0) / 8.0) * 128) % 128; 
      const flowY = Math.floor(((y + 4.0) / 8.0) * 128) % 128;
      
      // Get flow direction from noise field
      let flowForceX = 0;
      let flowForceY = 0;
      
      // Use simplex noise directly for flow - adjusted for more visible wave patterns
      const noiseValue = simplex.noise2D(x * 1.5 + deltaTime * 0.2, y * 1.5);
      flowForceX = Math.cos(noiseValue * Math.PI * 2) * 0.0003 * particleSpeed;
      flowForceY = Math.sin(noiseValue * Math.PI * 2) * 0.0003 * particleSpeed;
      
      // Apply flow force
      accelerations[idx] += flowForceX;
      accelerations[idx + 1] += flowForceY;
      
      // Force 2: Mouse interaction - enhanced for more visible effects
      const dx = mouseWorldX - x;
      const dy = mouseWorldY - y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      
      if (dist < interactionRadius * 3.0) { // Increased radius to match camera position
        // Calculate normalized direction away from mouse
        const dirX = -dx / dist;
        const dirY = -dy / dist;
        
        // Stronger effect for closer particles with smooth falloff
        const strength = (1 - dist / (interactionRadius * 3.0)) * interactionStrength * 0.001;
        
        // Apply repulsion force - intensified for visibility
        accelerations[idx] += dirX * strength;
        accelerations[idx + 1] += dirY * strength;
        
        // Add mouse velocity influence for more dynamic effect - enhanced
        accelerations[idx] += mouseVelocityRef.current.x * 0.0003;
        accelerations[idx + 1] += mouseVelocityRef.current.y * 0.0003;
        
        // Add some vertical movement to particles near mouse for a more dynamic effect
        accelerations[idx + 2] += (Math.random() - 0.5) * 0.0003 * interactionStrength;
      }
      
      // Force 3: Return to original position (stability) - relaxed for more natural motion
      const returnForceX = (originalPositions![idx] - x) * 0.00007;
      const returnForceY = (originalPositions![idx + 1] - y) * 0.00007;
      const returnForceZ = (originalPositions![idx + 2] - z) * 0.0002; // Stronger for z to keep particles in view
      
      accelerations[idx] += returnForceX;
      accelerations[idx + 1] += returnForceY;
      accelerations[idx + 2] += returnForceZ;
      
      // Update velocities using accelerations
      velocities[idx] += accelerations[idx] * deltaTime;
      velocities[idx + 1] += accelerations[idx + 1] * deltaTime;
      velocities[idx + 2] += accelerations[idx + 2] * deltaTime;
      
      // Apply damping to prevent excessive velocities - slightly reduced for more fluid motion
      const damping = 0.985;
      velocities[idx] *= damping;
      velocities[idx + 1] *= damping;
      velocities[idx + 2] *= damping;
      
      // Update positions
      positions[idx] += velocities[idx] * deltaTime * 60; // Scale by 60 to make velocity frame-rate independent
      positions[idx + 1] += velocities[idx + 1] * deltaTime * 60;
      positions[idx + 2] += velocities[idx + 2] * deltaTime * 60;
      
      // Constrain particles to within a reasonable view volume
      if (Math.abs(positions[idx]) > 8.0) {
        positions[idx] = Math.sign(positions[idx]) * 8.0;
        velocities[idx] *= -0.5; // Bounce with energy loss
      }
      if (Math.abs(positions[idx + 1]) > 5.0) {
        positions[idx + 1] = Math.sign(positions[idx + 1]) * 5.0;
        velocities[idx + 1] *= -0.5; // Bounce with energy loss
      }
      if (Math.abs(positions[idx + 2]) > 2.0) {
        positions[idx + 2] = Math.sign(positions[idx + 2]) * 2.0;
        velocities[idx + 2] *= -0.5; // Bounce with energy loss
      }
    }
    
    // Mark position buffer for GPU update
    (particlesRef.current.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    
    // Update shader uniforms
    (particlesRef.current.material as THREE.ShaderMaterial).uniforms.time.value = clockRef.current.getElapsedTime();
  };

  // Animation loop
  const animate = () => {
    if (!rendererRef.current || !composerRef.current) return;
    
    // Get time since last frame
    const deltaTime = Math.min(clockRef.current.getDelta(), 0.05); // Cap delta to prevent jumps
    timeStepRef.current = deltaTime;
    
    // Update particle simulation
    updateParticles(deltaTime);
    
    // Render with post-processing
    composerRef.current.render();
    
    // Continue animation loop
    rafRef.current = requestAnimationFrame(animate);
  };

  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current || !composerRef.current) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update camera
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    
    // Update renderer and composer
    rendererRef.current.setSize(width, height);
    composerRef.current.setSize(width, height);
    
    // Update pixel ratio uniform if it exists
    if (particlesRef.current) {
      const material = particlesRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms.pixelRatio) {
        material.uniforms.pixelRatio.value = Math.min(window.devicePixelRatio, 2);
      }
    }
  };

  // Clean up resources
  const cleanUp = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    if (rendererRef.current && mountRef.current) {
      mountRef.current.removeChild(rendererRef.current.domElement);
    }
    
    // Dispose of geometries and materials
    if (particlesRef.current) {
      particlesRef.current.geometry.dispose();
      (particlesRef.current.material as THREE.Material).dispose();
    }
    
    // Dispose of flow field texture
    if (flowFieldRef.current) {
      flowFieldRef.current.dispose();
    }
    
    // Remove event listeners
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);
  };

  // Set up scene when component mounts
  useEffect(() => {
    console.log("DataStream component mounted");
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
      id="3d-container"
    />
  );
};

export default DataStream;
