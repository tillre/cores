module.exports = {

  name: 'Design schema',
  description: 'JSON schema for design docs',

  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    views: { type: 'object' },
    shows: { type: 'object' },
    lists: { type: 'object' }
  }
  
};