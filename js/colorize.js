/**

 Trivial effect that just changes color of things.

 */
(function () {

    "use strict";

    SceneJS.fx.Colorize = function () {

        var material = null;

        /**
         * Initializes this effect
         *
         * @param cfg
         */
        this.init = function (cfg) {

        };

        /**
         * Activates this effect.
         *
         * @param {SceneJS.Node} parent Parent node onto which this effect attaches its own node.
         * @returns {SceneJS.Node} Parent node for the next effect to attach its nodes to.
         */
        this.activate = function (parent) {

            material = parent.addNode({
                type: "material",
                color: {r: 1, g: 0, b: 0}
            });

            var leaf = material.addNode();

            return leaf;
        };

        /**
         * Sets params for this effect.
         *
         * @param params
         */
        this.setParams = function (params) {
            if (material) {
                if (params.color) {
                    material.setColor(params.color);
                }
            }
        };

        /**
         * Deactivates this effect.
         */
        this.deactivate = function () {
            if (material) {
                material.destroy();
                material = null;
            }
        };
    };

})();