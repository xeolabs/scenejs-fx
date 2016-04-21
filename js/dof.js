(function () {

    "use strict";

    SceneJS.fx.DOF = function () {

        var self = this;
        var lookat;
        var camera;
        var synchLookatSub;
        var synchCameraSub;
        var root = null;
        var shader;

        var defaultParams = {
            texelSize: 0.00099, // Size of one texel (1 / width, 1 / height)
            blurCoeff: 0.0011,  // Calculated from the blur equation, b = ( f * ms / N )
            focusDist: 5.0,	// The distance to the subject in perfect focus (= Ds)
            ppm: 10000,         // Pixels per millimetre
            near: 0.1,
            far: 10000.0,
            autofocus: true,
            autoclip: true
        };

        /**
         * Initializes this effect
         *
         * @param _pipeline
         */
        this.init = function (cfg) {
            lookat = cfg.lookat;
            camera = cfg.camera;
        };

        /**
         * Activates this effect.
         *
         * @param {SceneJS.Node} parent Parent node onto which this effect attaches its own node.
         * @returns {SceneJS.Node} Parent node for the next effect to attach its nodes to.
         */
        this.activate = function (parent) {

            var colorTargetId = "__dof_colorTarget";
            var depthTargetId = "__dof_depthTarget";
            var colorTarget2Id = "__dof_colorTarget2";
            var leafId = "__dof_leaf";

            root = parent.addNode();

            root.addNodes([

                // Stage 1
                // Render scene to color and depth targets
                {
                    type: "stage",
                    priority: 1,
                    pickable: true,

                    nodes: [

                        // Output color target
                        {
                            type: "colorTarget",
                            id: colorTargetId,

                            nodes: [

                                // Output depth target
                                {
                                    type: "depthTarget",
                                    id: depthTargetId,

                                    nodes: [

                                        // Leaf node
                                        {
                                            id: leafId
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }

//                    // Debug stage - uncomment this to render the depth buffer to the canvas
//                    ,
//                    {
//                        type: "stage",
//                        priority: 1.2,
//
//                        nodes: [
//                            {
//                              type: "depthTarget/render",
//                                target: depthTarget
//                            }
//                        ]
//                    }
            ]);

            // Blur shader shared by stages 2 and 3
            shader = root.addNode({
                type: "shader",
                shaders: [

                    // Vertex stage just passes through the positions and UVs
                    {
                        stage: "vertex",
                        code: [
                            "attribute vec3 SCENEJS_aVertex;",
                            "attribute vec2 SCENEJS_aUVCoord0;",
                            "varying vec2 vUv;",
                            "void main () {",
                            "    gl_Position = vec4(SCENEJS_aVertex, 1.0);",
                            "    vUv = SCENEJS_aUVCoord0;",
                            "}"
                        ]
                    },

                    // Fragment stage blurs each pixel in color target by amount in proportion to
                    // corresponding depth in depth buffer
                    {
                        stage: "fragment",
                        code: [
                            "precision highp float;",

                            "uniform sampler2D SCENEJS_uSampler0;", // Colour target's texture
                            "uniform sampler2D SCENEJS_uSampler1;", // Depth target's texture

                            "uniform vec2 texelSize;",		        // Size of one texel (1 / width, 1 / height)
                            "uniform float orientation;",	        // 0 = horizontal, 1 = vertical
                            "uniform float blurCoeff;",	            // Calculated from the blur equation, b = ( f * ms / N )
                            "uniform float focusDist;",	            // The distance to the subject in perfect focus (= Ds)
                            "uniform float near;",		            // near clipping plane
                            "uniform float far;",		            // far clipping plane
                            "uniform float ppm;",		            // Pixels per millimetre
                            "varying vec2 vUv;",

                            /// Unpacks an RGBA pixel to floating point value.
                            "float unpack (vec4 colour) {",
                            "   const vec4 bitShifts = vec4(1.0,",
                            "   1.0 / 255.0,",
                            "   1.0 / (255.0 * 255.0),",
                            "   1.0 / (255.0 * 255.0 * 255.0));",
                            "   return dot(colour, bitShifts);",
                            "}",

                            // Calculates the blur diameter to apply on the image.
                            // b = (f * ms / N) * (xd / (Ds +- xd))
                            // Where:
                            // (Ds + xd) for background objects
                            // (Ds - xd) for foreground objects
                            "float getBlurDiameter (float d) {",
                            //  Convert from linear depth to metres
                            "   float Dd = d * (far - near);",
                            "   float xd = abs(Dd - focusDist);",
                            "   float xdd = (Dd < focusDist) ? (focusDist - xd) : (focusDist + xd);",
                            "   float b = blurCoeff * (xd / xdd);",
                            "   return b * ppm;",
                            "}",

                            "void main () {",

                            //  Maximum blur radius to limit hardware requirements.
                            //  Cannot #define this due to a driver issue with some setups
                            "   const float MAX_BLUR_RADIUS = 60.0;",

                            //  Pass the linear depth values recorded in the depth map to the blur
                            //  equation to find out how much each pixel should be blurred with the
                            //  given camera settings.
                            "   float depth = unpack(texture2D(SCENEJS_uSampler1, vUv));",
                            "   float blurAmount = getBlurDiameter(depth);",
                            "   blurAmount = min(floor(blurAmount), MAX_BLUR_RADIUS);",

                            //  Apply the blur
                            "   float count = 0.0;",
                            "   vec4 colour = vec4(0.0);",
                            "   vec2 texelOffset;",

                            "   if ( orientation == 0.0 )",
                            "       texelOffset = vec2(texelSize.x, 0.0);",
                            "   else",
                            "       texelOffset = vec2(0.0, texelSize.y);",

                            "   if ( blurAmount >= 1.0 ) {",
                            "       float halfBlur = blurAmount * 0.5;",
                            "       for (float i = 0.0; i < MAX_BLUR_RADIUS; ++i) {",
                            "           if ( i >= blurAmount )",
                            "               break;",
                            "           float offset = i - halfBlur;",
                            "           vec2 vOffset = vUv + (texelOffset * offset);",
                            "           colour += texture2D(SCENEJS_uSampler0, vOffset);",
                            "           ++count;",
                            "       }",
                            "   }",

                            //  Apply colour
                            "   if ( count > 0.0 )",
                            "       gl_FragColor = colour / count;",
                            "   else",
                            "       gl_FragColor = texture2D(SCENEJS_uSampler0, vUv);",

                            "}"
                        ]
                    }
                ],

                // Shader params for both horizontal and vertical blur passes
                params: {
                    "texelSize": [defaultParams.texelSize, defaultParams.texelSize],       // Texel size
                    "blurCoeff": defaultParams.blurCoeff,	// Calculated from the blur equation, b = ( f * ms / N )
                    "focusDist": defaultParams.focusDist,	// The distance to the subject in perfect focus (= Ds)
                    "near:": defaultParams.near,		        // near clipping plane
                    "far": defaultParams.far,		            // far clipping plane
                    "ppm": defaultParams.ppm,		            // Pixels per millimetre
                    "orientation": 0.0	                // 0 = horizontal, 1 = vertical
                }
            });


            // Stages 2 and 3
            shader.addNodes([

                // Stage 2
                // Horizontal blur using color and depth targets,
                // rendering to a second color target
                {
                    type: "stage",
                    priority: 2,

                    nodes: [

                        // Output color target
                        {
                            type: "colorTarget",
                            id: colorTarget2Id,
                            nodes: [

                                // Input color target
                                {
                                    type: "texture",
                                    target: colorTargetId,
                                    nodes: [

                                        // Input depth target
                                        {
                                            type: "texture",
                                            target: depthTargetId,
                                            nodes: [

                                                // Shader parameters for this stage
                                                {
                                                    type: "shaderParams",
                                                    params: {
                                                        "orientation": 0.0	// 0 = horizontal, 1 = vertical
                                                    },

                                                    nodes: [
                                                        {
                                                            type: "geometry/quad"
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },

                // Stage 3
                // Vertical blur taking as inputs the depth target and the second color target,
                // rendering to the canvas
                {
                    type: "stage",
                    priority: 3,

                    nodes: [

                        // Input second color target
                        {
                            type: "texture",
                            target: colorTarget2Id,
                            nodes: [

                                // Input depth target
                                {
                                    type: "texture",
                                    target: depthTargetId,
                                    nodes: [

                                        // Shader parameters for this stage
                                        {
                                            type: "shaderParams",
                                            params: {
                                                "orientation": 1.0	// 0 = horizontal, 1 = vertical
                                            },

                                            nodes: [

                                                // Quad primitive, implemented by plugin at
                                                // http://scenejs.org/api/latest/plugins/node/geometry/quad.js
                                                {
                                                    type: "geometry/quad"
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]);

            synchLookatSub = lookat.on("matrix", synchLookat);
            synchLookat();

            if (camera) {
                synchCameraSub = camera.on("matrix", synchCamera);
                synchCamera();

            }

            var leaf = parent.getScene().getNode(leafId);

            return leaf;
        };

        function synchLookat() {
            var look = lookat.getLook();
            var eye = lookat.getEye();
            self.setParams({
                focusDist: SceneJS_math_lenVec3([look.x - eye.x, look.y - eye.y, look.z - eye.z])
            });
        }

        function synchCamera() {
            var optics = camera.getOptics();
            self.setParams({
                near: optics.near,
                far: optics.far
            });
        }

        /**
         * Sets params for this effect.
         *
         * @param params
         */
        this.setParams = function (params) {
            if (shader) {
                shader.setParams(params);
            }
        };

        /**
         * Deactivates this effect.
         */
        this.deactivate = function () {
            if (root) {
                root.destroy();
                root = null;
                shader = null;

                lookat.off(synchLookatSub);

                if (camera) {
                    camera.off(synchCameraSub);
                }
            }
        };
    }

})();