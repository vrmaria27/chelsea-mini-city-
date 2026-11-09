// Minimal WebXR typings for the subset this app uses (TypeScript's DOM lib does not ship WebXR).
export {};

declare global {
  type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';
  type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';
  type XRHandedness = 'none' | 'left' | 'right';
  type XRVisibilityState = 'visible' | 'visible-blurred' | 'hidden';

  interface XRSystem extends EventTarget {
    isSessionSupported(mode: XRSessionMode): Promise<boolean>;
    requestSession(mode: XRSessionMode, init?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<XRSession>;
  }

  interface Navigator {
    readonly xr?: XRSystem;
  }

  interface XRRigidTransform {
    readonly position: DOMPointReadOnly;
    readonly orientation: DOMPointReadOnly;
    readonly matrix: Float32Array;
    readonly inverse: XRRigidTransform;
  }

  interface XRPose {
    readonly transform: XRRigidTransform;
  }

  interface XRView {
    readonly eye: 'left' | 'right' | 'none';
    readonly projectionMatrix: Float32Array;
    readonly transform: XRRigidTransform;
  }

  interface XRViewerPose extends XRPose {
    readonly views: ReadonlyArray<XRView>;
  }

  interface XRSpace extends EventTarget {}
  interface XRReferenceSpace extends XRSpace {}

  interface XRInputSource {
    readonly handedness: XRHandedness;
    readonly targetRayMode: 'gaze' | 'tracked-pointer' | 'screen' | 'transient-pointer';
    readonly targetRaySpace: XRSpace;
    readonly gripSpace?: XRSpace;
    readonly gamepad?: Gamepad;
    readonly profiles: string[];
  }

  interface XRFrame {
    readonly session: XRSession;
    getViewerPose(space: XRReferenceSpace): XRViewerPose | undefined;
    getPose(space: XRSpace, base: XRSpace): XRPose | undefined;
  }

  interface XRViewport {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  interface XRWebGLLayer {
    readonly framebuffer: WebGLFramebuffer | null;
    getViewport(view: XRView): XRViewport | undefined;
  }

  // eslint-disable-next-line no-var
  var XRWebGLLayer: {
    prototype: XRWebGLLayer;
    new (session: XRSession, ctx: WebGL2RenderingContext, init?: { antialias?: boolean; framebufferScaleFactor?: number }): XRWebGLLayer;
  };

  interface XRInputSourceEvent extends Event {
    readonly frame: XRFrame;
    readonly inputSource: XRInputSource;
  }

  interface XRSession extends EventTarget {
    readonly inputSources: ReadonlyArray<XRInputSource>;
    readonly visibilityState: XRVisibilityState;
    readonly renderState: { readonly baseLayer?: XRWebGLLayer };
    updateRenderState(state: { baseLayer?: XRWebGLLayer; depthNear?: number; depthFar?: number }): void;
    requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
    requestAnimationFrame(cb: (time: number, frame: XRFrame) => void): number;
    cancelAnimationFrame(handle: number): void;
    end(): Promise<void>;
  }

  interface WebGL2RenderingContext {
    makeXRCompatible(): Promise<void>;
  }
}
