'use strict';

exports.mochaGlobalSetup = async function() {
    require('dd-trace').init();
};
