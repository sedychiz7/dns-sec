// Expo's default config handles npm workspaces (the shared package) automatically.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
