// This file acts as a bridge to the main DashPlayer library.
// It imports the necessary components and re-exports them with the names the application expects.
import { o, p, q } from './lib/DashPlayer-Dn48qdmH.js';

// o -> DOT_WIDTH
// p -> DashPlayer
// q -> DashPlayerWebGLImplementation
export const DOT_WIDTH = o;
export const DashPlayer = p;
export const DashPlayerWebGLImplementation = q;

console.log("DashPlayer module bridge loaded successfully."); 