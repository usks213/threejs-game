/** Synchronous test-only capture must coexist with Three's in-flight async PBO.
 * Restore the binding without consuming errors or changing the game renderer. */
export function captureDefaultPixels(gl:WebGL2RenderingContext,width:number,height:number){
 const previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null,data=new Uint8Array(width*height*4);
 gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 try{gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
 finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
}
