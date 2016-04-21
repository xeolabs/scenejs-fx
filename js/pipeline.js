(function () {

    "use strict";

    SceneJS.fx = {};

    /**
     * A posteffects pipeline for SceneJS.
     *
     * @param {SceneJS.Node} root Scene subgraph that we'll apply effects to.
     * @constructor
     */
    SceneJS.fx.Pipeline = function (root) {

        var scene = root.getScene();

        var lookat = root.findParentByType("lookAt");

        if (!lookat) {
            throw "SceneJS.fx.Pipeline: Could not find a 'lookAt' node";
        }

        var camera = root.findParentByType("camera");

        //var camera = root.findParentByType("camera");
        //
        //if (!camera) {
        //    throw "SceneJS.fx.Pipeline: Could not find a 'camera' node";
        //}

        var effects = {};
        var effectsList = [];
        var numEffects = 0;

        // The last node in the effects pipeline
        var leaf = null;

        // True when scene needs rebuild
        var dirty = false;

        // Scene "tick" handle
        var onTick;

        /**
         * Adds an effect to this pipeline.
         *
         * @param effectId
         * @param effect
         */
        this.add = function (effectId, effect) {

            if (effects[effectId]) {
                console.log("SceneJS.fx.Pipeline.add: Effect with this ID already registered: " + effectId);
                return;
            }

            effect = {
                effectId: effectId,
                effect: effect,
                order: numEffects++,
                params: {
                    active: false
                }
            };

            effects[effectId] = effect;

            effectsList.push(effect);

            effect.effect.init({
                lookat: lookat,
                camera: camera
            });
        };


        /**
         Batch-updates effects, activating/deactivating and setting parameters on them.

         <p>Usage:</p>
         <pre>

         // Activate and set params on an effect, deactivate another:

         myEffects.set({
           effects: {
                dof: {
                    active: true,
                    texelSize : 0.00099,
                    blurCoeff : 0.0011
                },
                blur: {
                    active: false
                }
           }
       });

         // The "clear" param deactivates all effects first:

         myEffects.set({
           clear: true,
           effects: {
               dof: {
                   active: true,
                   texelSize : 0.00099,
                   blurCoeff : 0.0011
               },
               blur: {
                   active: false
               }
           }
       });

         </pre>
         @param params
         */
        this.set = function (params) {

            var effectId;

            // Option to clear the set of active effects

            if (params.clear) {

                // Deactivate all effects
                for (var i = 0, len = effectsList.length; i < len; i++) {
                    effectsList[i].params.active = false;
                }

                // Need to lazy-rebuild effects pipeline now
                dirty = true;
            }

            if (params.effects) {

                // Update one or more effects

                var updates = params.effects;
                var update;

                for (effectId in updates) {
                    if (updates.hasOwnProperty(effectId)) {

                        update = updates[effectId];

                        setEffectParams(effectId, update);

                        dirty = true;
                    }
                }
            }
        };

        function setEffectParams(effectId, params) {

            var effect = effects[effectId];

            if (!effect) {
                console.log("SceneJS.fx.Pipeline: Effect not found: " + effectId);
                return;
            }

            if (effect.params.active && params.active !== false) {

                // Effect is active and not about to deactivate it - set params on it
                effect.effect.setParams(params);
            }

            // Save the param updates
            apply(params, effect.params);

            if (params.active !== undefined) {

                // Need to lazy-rebuild effects pipeline now
                dirty = true;
            }
        }

        onTick = scene.on("tick", function () {
            if (dirty) {
                rebuild();
                dirty = false;
            }
        });

        function rebuild() {

            var i;
            var len;
            var effect;
            var params;

            var contentNodes;

            if (leaf) {
                contentNodes = leaf.disconnectNodes();
                root.removeNodes();
            } else {
                contentNodes = root.disconnectNodes();
            }

            leaf = root;

            for (i = 0, len = effectsList.length; i < len; i++) {

                effect = effectsList[i];

                params = effect.params;

                if (params.active) {
                    leaf = effect.effect.activate(leaf);
                    effect.effect.setParams(params);
                }
            }

            leaf.addNodes(contentNodes);

            scene.renderFrame({
                force: true
            });
        }
    };

    /**
     * Add properties of o to o2
     * @private
     */
    function apply(o, o2) {
        for (var name in o) {
            if (o.hasOwnProperty(name)) {
                    o2[name] = o[name];
            }
        }
        return o2;
    }
})();
