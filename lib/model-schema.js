module.exports = {

  name: 'Model schema',
  description: 'JSON Schema for model schemas',

  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    properties: { type: 'object' }
  },

  required: ['properties']
};