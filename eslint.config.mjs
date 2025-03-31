import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: true,
  rules: {
    'no-console': 'off',
    'ts/no-unused-expressions': 'off',
    'vue/custom-event-name-casing': 'off',
  },
})
