import React from 'react';
import { MyDiv } from '../Common/Components';
import { Box, Tab, Tabs } from '@mui/material';
import { Col, Row } from 'react-bootstrap';


function CustomTabs({ tabs, children, activeTab: initialTab, onTabChange }) {
    const [activeTabState, setActiveTabState] = React.useState(initialTab || tabs[0].key);
    
    const handleTabChange = (_, newTab) => {
        setActiveTabState(newTab);
        onTabChange(newTab);
    };
    return (
        <>
            <MyDiv className="GeneralHeading pb-0 flex-wrap mt-2">
                <Row>
                    <Col md={12}>
                        <Box sx={{ maxWidth: { xs: 320, md: 1400 }, bgcolor: 'background.paper' }}>
                            <Tabs value={activeTabState} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                                            sx={{ '& .MuiTab-root': { color: '#000' }, '& .Mui-selected': { color: '#d22530' } }}>
                                {tabs.map((tab) => (
                                    <Tab value={tab.key} label={tab.title} key={tab.key} />
                                ))}
                            </Tabs>
                        </Box>
                    </Col>
                </Row>
                
            </MyDiv>
            {children}
        </>
    );
}

export default CustomTabs;


