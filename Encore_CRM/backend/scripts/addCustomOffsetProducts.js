const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/EncoreDB').then(async () => {
  const col = mongoose.connection.db.collection('awf_product_libraries');

  // First list existing Offset and Bends products
  const existing = await col.find({ part_class: 'Offsets' }).toArray();
  console.log('Existing Offset products:');
  existing.forEach(p => console.log(`  ${p.sub_category} | ${p.name}`));

  // Add custom products for Offsets
  const customProducts = [
    // Standard Offset - custom square
    {
      part_class: 'Offsets',
      sub_category: 'Standard Offset',
      name: '--- x --- mm Square Offset',
      description: 'Custom square offset - enter dimensions',
      image: null,
      status: 'active',
      created_by: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    // Standard Offset - custom round
    {
      part_class: 'Offsets',
      sub_category: 'Standard Offset',
      name: '--- mm Round Offset',
      description: 'Custom round offset - enter dimension',
      image: null,
      status: 'active',
      created_by: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    // Bends (Elbow/Shoes) - custom square
    {
      part_class: 'Offsets',
      sub_category: 'Bends (Elbow/Shoes)',
      name: '--- x --- mm Square Elbow',
      description: 'Custom square elbow - enter dimensions',
      image: null,
      status: 'active',
      created_by: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    // Bends (Elbow/Shoes) - custom round
    {
      part_class: 'Offsets',
      sub_category: 'Bends (Elbow/Shoes)',
      name: '--- mm Round Elbow',
      description: 'Custom round elbow - enter dimension',
      image: null,
      status: 'active',
      created_by: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await col.insertMany(customProducts);
  console.log(`\nInserted ${result.insertedCount} custom Offset products`);

  process.exit();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
