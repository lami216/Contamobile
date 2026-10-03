const { withAndroidStyles } = require('expo/config-plugins');

module.exports = function withGoldenSystemBars(config) {
  return withAndroidStyles(config, (mod) => {
    const theme = mod.modResults.resources.style.find((style) => style.$.name === 'AppTheme');
    if (!theme) throw new Error('Android AppTheme is missing');
    theme.item = theme.item || [];
    const values = {
      'android:windowLightNavigationBar': 'false',
      'android:enforceNavigationBarContrast': 'false',
      'android:navigationBarColor': '#080C14',
    };
    for (const [name, value] of Object.entries(values)) {
      const item = theme.item.find((entry) => entry.$.name === name);
      if (item) item._ = value;
      else theme.item.push({ $: { name }, _: value });
    }
    return mod;
  });
};

