const router = require('express').Router();

router.get('/groups-classes', (req, res) => {
    res.json({
        data: {
            Flashing: ['Gutters', 'Cappings', 'Aprons', 'Ridge & Valley', 'Soakers', 'Foot Moulds', 'Misc'],
            Jobbing: [],
            FG: [],
            Cladding: [],
            Roofing: [],
            GBI: [],
            'GBI.L': []
        }
    });
});

module.exports = router;
