export default {
  build: { manifest: true },
  plugins: [{
    name: 'installed-acceptance-module-evidence',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
        file: item.fileName, imports: item.imports, dynamicImports: item.dynamicImports,
        modules: Object.keys(item.modules),
      }));
      this.emitFile({ type: 'asset', fileName: 'module-inventory.json', source: JSON.stringify(chunks, null, 2) });
    },
  }],
};
