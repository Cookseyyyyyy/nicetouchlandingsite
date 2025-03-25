import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface ContourLinesProps {
  // Configuration parameters
  lineCount?: number;           // Number of contour lines
  lineThickness?: number;       // Thickness of lines
  lineColor?: string;           // Color of the lines
  noiseScale?: number;          // Scale of noise pattern
  animationSpeed?: number;      // Speed of animation
  interactionRadius?: number;   // Radius of mouse influence
  interactionStrength?: number; // Strength of mouse influence
  bloomStrength?: number;       // Strength of bloom effect
}

const ContourLines: React.FC<ContourLinesProps> = ({
  lineCount = 30,
  lineThickness = 1,
  lineColor = '#ffffff',
  noiseScale = 0.03,
  animationSpeed = 0.2,
  interactionRadius = 0.15,
  interactionStrength = 0.3,
  bloomStrength = 0.5
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const linesRef = useRef<THREE.LineSegments[]>([]);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  
  // Original vertex positions for each line
  const originalVerticesRef = useRef<Float32Array[]>([]);
  
  // Create improved noise functions for organic contour generation
  const simplexNoise = {
    // Enhanced noise function
    noise: (x: number, y: number, z: number) => {
      // Multiple frequencies for more organic look
      return Math.sin(x * 1.5 + z * 0.5) * Math.cos(y * 2.1 + z * 0.4) * 0.5 +
             Math.sin(x * 3.7 + y * 0.8 + z * 0.3) * 0.3 +
             Math.cos(y * 2.3 + x * 0.7 + z * 0.6) * 0.2;
    }
  };

  // Handle mouse movement
  const handleMouseMove = (event: MouseEvent) => {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
  };

  // Create and initialize the scene
  const initScene = () => {
    if (!mountRef.current) return;
    
    // Get container dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    
    // Create scene with dark blue background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050d1f'); // Darker, richer blue background
    sceneRef.current = scene;

    // Create perspective camera with wider field of view
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.z = 1.8; // Closer to see more details
    cameraRef.current = camera;

    // Create renderer with higher quality settings
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance' 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Clear mount point before appending
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Generate contour lines
    generateContourLines();
    
    // Setup post-processing for glow effects
    setupPostProcessing(renderer, scene, camera);
    
    // Add event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    
    // Start animation loop
    animate();
    
    console.log("Contour lines initialized");
  };

  // Generate contour lines using noise function
  const generateContourLines = () => {
    if (!sceneRef.current) return;
    
    // Store references for clean up
    linesRef.current = [];
    originalVerticesRef.current = [];
    
    // Create lines with different heights (z values) to represent contours
    for (let i = 0; i < lineCount; i++) {
      // Calculate height value for this contour line
      const heightValue = (i / lineCount) * 2 - 1; // Range from -1 to 1
      
      // Create gradient color for better visual appeal
      const color = new THREE.Color(lineColor);
      // Add slight hue variation based on height
      if (lineColor === '#ffffff') {
        // If white, add subtle blue tint to some lines
        const hue = 0.6 + (heightValue * 0.02); // Slight blue variation (0.6 is blue in hsl)
        const saturation = Math.abs(heightValue) * 0.2; // More saturated at extremes
        const lightness = 0.9 - Math.abs(heightValue) * 0.1; // Slightly less bright at extremes
        color.setHSL(hue, saturation, lightness);
      }
      
      // Create line material with custom properties
      const material = new THREE.LineBasicMaterial({
        color: color,
        opacity: 0.9 + Math.random() * 0.1, // Higher opacity for better visibility
        transparent: true,
        linewidth: lineThickness * (1 + Math.abs(heightValue) * 0.5) // Thicker lines at extremes
      });
      
      // Generate contour line based on noise
      const { geometry, originalVertices } = createContourGeometry(heightValue);
      
      // Create line and add to scene
      const line = new THREE.LineSegments(geometry, material);
      sceneRef.current.add(line);
      
      // Store references
      linesRef.current.push(line);
      originalVerticesRef.current.push(originalVertices);
    }
  };

  // Create geometry for a single contour line
  const createContourGeometry = (heightValue: number) => {
    // Adjust resolution based on screen size - higher for clearer lines
    const width = window.innerWidth;
    const height = window.innerHeight;
    const baseResolution = 180; // Higher base resolution
    const segmentsX = Math.ceil(baseResolution * (width / height));
    const segmentsY = baseResolution;
    
    // Create vertices and indices for line segments
    const vertices = new Float32Array((segmentsX + 1) * (segmentsY + 1) * 3);
    const indices: number[] = [];
    
    // Store original vertex positions for animation
    const originalVertices = new Float32Array(vertices.length);
    
    // Create grid of vertices with noise-based height
    let vertexIndex = 0;
    
    // Use varying thresholds for different lines to create varied densities
    // Thinner threshold creates more precise lines
    const contourThreshold = 0.015 + Math.abs(heightValue) * 0.01; 
    
    for (let y = 0; y <= segmentsY; y++) {
      for (let x = 0; x <= segmentsX; x++) {
        // Calculate normalized position (-1 to 1)
        const normalizedX = (x / segmentsX) * 2 - 1;
        const normalizedY = (y / segmentsY) * 2 - 1;
        
        // Scale coordinates for aspect ratio
        const aspect = width / height;
        const correctedX = normalizedX * aspect;
        
        // Add some variation to the noise based on the height value
        // This helps make each contour line distinct
        const noiseScale2 = noiseScale * (1 + Math.abs(heightValue) * 0.3);
        
        // Evaluate noise function to determine if this point is on the contour
        const noiseVal = simplexNoise.noise(
          correctedX / noiseScale2, 
          normalizedY / noiseScale2, 
          heightValue * 1.2 // Amplify height differences
        );
        
        // Only include vertex if it's close to the contour line
        const isOnContour = Math.abs(noiseVal) < contourThreshold;
        
        // Set vertex position
        vertices[vertexIndex] = isOnContour ? normalizedX : 999; // X (use 999 to hide unused vertices)
        vertices[vertexIndex + 1] = isOnContour ? normalizedY : 999; // Y
        vertices[vertexIndex + 2] = isOnContour ? heightValue * 0.1 : 999; // Z - more depth for better visibility
        
        // Store original positions
        originalVertices[vertexIndex] = vertices[vertexIndex];
        originalVertices[vertexIndex + 1] = vertices[vertexIndex + 1];
        originalVertices[vertexIndex + 2] = vertices[vertexIndex + 2];
        
        // Create indices for line segments - only if both points are visible
        if (x < segmentsX && y < segmentsY) {
          const currentIndex = y * (segmentsX + 1) + x;
          const rightIndex = currentIndex + 1;
          const bottomIndex = currentIndex + (segmentsX + 1);
          
          // We'll check if vertices are valid before adding to reduce diagonal artifacts
          if (vertices[vertexIndex] !== 999 && vertices[vertexIndex + 3] !== 999) {
            // Add horizontal line only if both endpoints are on a contour
            indices.push(currentIndex, rightIndex);
          }
          
          if (vertices[vertexIndex] !== 999 && vertices[vertexIndex + (segmentsX + 1) * 3] !== 999) {
            // Add vertical line only if both endpoints are on a contour
            indices.push(currentIndex, bottomIndex);
          }
        }
        
        vertexIndex += 3;
      }
    }
    
    // Create geometry and set indices
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    
    return { geometry, originalVertices };
  };

  // Setup post-processing effects
  const setupPostProcessing = (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) => {
    // Basic render pass
    const renderPass = new RenderPass(scene, camera);
    
    // Bloom pass for better glow on lines
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength || 0.3,  // Default bloom if not provided
      0.4,                  // Radius
      0.85                  // Threshold
    );
    
    // Create composer and add passes
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    
    composerRef.current = composer;
  };

  // Animation loop
  const animate = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // Update time reference for animation
    timeRef.current += 0.01 * animationSpeed;
    
    // Update each contour line
    linesRef.current.forEach((line, lineIndex) => {
      const originalVertices = originalVerticesRef.current[lineIndex];
      
      // Get current vertices
      const positions = (line.geometry.getAttribute('position') as THREE.BufferAttribute).array;
      
      // Update vertex positions based on time and mouse influence
      for (let i = 0; i < positions.length; i += 3) {
        // Skip hidden vertices (those set to 999)
        if (originalVertices[i] === 999) continue;
        
        // Get original position
        const originalX = originalVertices[i];
        const originalY = originalVertices[i + 1];
        const originalZ = originalVertices[i + 2];
        
        // Apply time-based animation (more pronounced drift)
        const timeOffset = timeRef.current;
        const linePhase = (lineIndex / lineCount) * Math.PI * 2; // Different phase for each line
        const animX = originalX + Math.sin(timeOffset + originalY * 2 + linePhase) * 0.03;
        const animY = originalY + Math.cos(timeOffset + originalX * 2 + linePhase) * 0.03;
        
        // Calculate distance from mouse in screen space
        const dx = mouseRef.current.x - animX;
        const dy = mouseRef.current.y - animY;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Apply mouse influence if within radius
        if (distance < interactionRadius) {
          // Calculate influence (stronger when closer)
          const influence = (1 - distance / interactionRadius) * interactionStrength;
          
          // Direction away from mouse (normalized)
          const dirX = dx !== 0 ? -dx / distance : 0;
          const dirY = dy !== 0 ? -dy / distance : 0;
          
          // Apply repulsion with some added waves
          positions[i] = animX + dirX * influence * (1 + Math.sin(timeOffset * 3) * 0.2);
          positions[i + 1] = animY + dirY * influence * (1 + Math.cos(timeOffset * 3) * 0.2);
        } else {
          // No mouse influence, just use animated position
          positions[i] = animX;
          positions[i + 1] = animY;
        }
        
        // Maintain original Z position with slight wave effect
        positions[i + 2] = originalZ + Math.sin(timeOffset + (animX + animY) * 2) * 0.01;
      }
      
      // Mark geometry for update
      (line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    });
    
    // Render with post-processing
    if (composerRef.current) {
      composerRef.current.render();
    } else if (rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
    // Continue animation
    rafRef.current = requestAnimationFrame(animate);
  };

  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    
    // Update perspective camera
    cameraRef.current.aspect = aspect;
    cameraRef.current.updateProjectionMatrix();
    
    // Update renderer
    rendererRef.current.setSize(width, height);
    
    // Update composer if it exists
    if (composerRef.current) {
      composerRef.current.setSize(width, height);
    }
    
    // Regenerate contour lines to match new aspect ratio
    if (sceneRef.current) {
      // Remove old lines
      linesRef.current.forEach(line => sceneRef.current?.remove(line));
      
      // Generate new lines
      generateContourLines();
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
    linesRef.current.forEach(line => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    
    // Remove event listeners
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);
  };

  // Initialize scene on component mount
  useEffect(() => {
    console.log("ContourLines component mounted");
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
        background: 'linear-gradient(to bottom, #050d1f 0%, #0a1a3a 100%)', // Fallback gradient
      }}
      id="contour-container"
    />
  );
};

export default ContourLines; 