const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .obj files as static assets instead of trying to parse them as JS
config.resolver.assetExts.push('obj', 'mtl', 'glb', 'gltf', 'bin');

module.exports = config;
