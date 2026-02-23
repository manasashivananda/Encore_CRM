/**
 * Meta Routes — Part Group & Class taxonomy for Template Library
 *
 * AWF Changes (20-Feb-2026):
 * - Added AWF part group with classes: Downpipe, Clips & Pops, Offsets, Rollforming
 * - Added `subCategories` field to the response — provides sub-category data for part classes
 *   that have a second level of navigation (e.g., Downpipe → Standard D/P, Manual D/P)
 * - Flashing and all other existing groups are unchanged
 */
const router = require('express').Router();

router.get('/groups-classes', (req, res) => {
    res.json({
        data: {
            // AWF part group — downpipes, clips, offsets, rollforming
            AWF: ['Downpipe', 'Clips & Pops', 'Offsets', 'Rollforming'],
            // Existing part groups — DO NOT MODIFY, used by Flashing drawing flow
            Flashing: ['Gutters', 'Cappings', 'Aprons', 'Ridge & Valley', 'Soakers', 'Foot Moulds', 'Misc'],
            Jobbing: [],
            FG: [],
            Cladding: [],
            Roofing: [],
            GBI: [],
            'GBI.L': []
        },
        // Sub-categories within AWF part classes — shown as buttons in the template area.
        // Only part classes with sub-categories need entries here.
        // To add a new sub-category: add an entry under partGroup → partClass with an array of sub-category names.
        subCategories: {
            AWF: {
                Downpipe: ['Standard D/P', 'Manual D/P'],
                Offsets: ['Standard Offset', 'Custom Offset', 'Bends (Elbow/Shoes)']
                // Clips & Pops and Rollforming have no sub-categories — templates show directly
            }
        }
    });
});

module.exports = router;
