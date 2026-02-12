const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the monorepo root so Metro can resolve the local `file:../..` link
config.watchFolders = [monorepoRoot]

// Only resolve node_modules from the example directory
const exampleNodeModules = path.resolve(projectRoot, 'node_modules')
config.resolver.nodeModulesPaths = [exampleNodeModules]

// Block Metro from crawling into the root node_modules (which has a second copy of React)
config.resolver.blockList = [
  new RegExp(path.resolve(monorepoRoot, 'node_modules').replace(/[/\\]/g, '[/\\\\]') + '/.*'),
]

// Follow symlinks created by `npm install` for `file:` dependencies
config.resolver.unstable_enableSymlinks = true

module.exports = config
