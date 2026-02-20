import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { HeadingFour, MyDiv } from './Components';
import PropTypes from 'prop-types';
import { styled } from '@mui/material/styles';

const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
  '& .super-active-row': {
    backgroundColor: '#fcefe3 !important',
    '&:hover': {
      backgroundColor: '#f7e2cfff !important',
    },
  },
}));

function CustomDataGrid({
    rows = [],
    columns = [],
    loading = false,
    checkboxSelection = false,
    density = 'standard',
    disableSelectionOnClick = true,
    disableColumnMenu = true,
    paginationMode = 'server',
    pageLimit = 10,
    page = 1,
    total = 0,
    rowHeight = 40,
    hideFooterPagination = false,
    hideFooter = false,
    onPageChange = () => {},
    onPageSizeChange = () => {},
    handleCellEdit = () => {},
    getRowClassName = () => {},
    gridHeight = "auto",
    ...props
}){
    // Filter out columns where hideable is true
    const visibleColumns = columns.filter(column => !column.hideable);

    return (
        <Box sx={{ 
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            height: gridHeight,
            '& .MuiDataGrid-root': {
                border: 'none',
                backgroundColor: 'white'
            },
            '& .MuiDataGrid-main': {
                overflow: 'auto',
            },
            '& .MuiDataGrid-virtualScroller': {
                overflow: 'auto !important',
            },
            '& .MuiDataGrid-cell': {
                border: '1px solid darkgrey',
                // borderBottom: '0px',
                lineHeight: 'normal !important',
                padding: '8px !important',
                '&:hover': {
                    zIndex: 100,
                },
                // '&.Mui-selected': {
                //     backgroundColor: 'none !important',
                // },
                // '&.Mui-selected:hover': {
                //     backgroundColor: 'none !important',
                // },
                '&.MuiDataGrid-cell--textCenter': {
                    textAlign: 'center',
                },
                '&.MuiDataGrid-cell--editable': {
                    // backgroundColor: 'rgba(155, 25, 34, 0.08)',
                    '&:hover': {
                        // backgroundColor: '#f9f9f9',
                    }
                },
            },
            '& .MuiDataGrid-row': {
                '&.Mui-selected': {
                    backgroundColor: 'transparent',
                },
                '&.Mui-selected:hover': {
                    backgroundColor: 'transparent',
                },
            },
            '& .MuiDataGrid-columnHeaders': {
                position: 'sticky',
                top: 0,
                zIndex: 1,
                '& .MuiDataGrid-columnHeader': {
                    padding: '8px !important',
                    border: '1px solid darkgrey',
                    backgroundColor: '#c4bcbcff',
                    '&:hover': {
                        backgroundColor: 'none',
                    }
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: '#333',
                }
            },
        }}>
            <StyledDataGrid
                rows={rows}
                columns={visibleColumns}
                loading={loading}
                onCellEditStop={handleCellEdit}
                initialState={{
                    pagination: {
                        paginationModel: { pageSize: pageLimit, page },
                    },
                }}
                paginationMode={paginationMode}
                pageSizeOptions={[5, 10, 20, 50]}
                onPaginationModelChange={(params) => {
                    onPageChange(params.page);
                    onPageSizeChange(params.pageSize);
                }}
                hideFooterPagination={hideFooterPagination}
                rowCount={total}
                checkboxSelection={checkboxSelection}
                density={density}
                rowHeight={rowHeight}
                columnHeaderHeight={40}
                disableColumnMenu={disableColumnMenu}
                componentsProps={{
                    toolbar: {
                        showQuickFilter: false,
                        quickFilterProps: { debounceMs: 500 }
                    }
                }}
                showCellVerticalBorder={true}    
                showColumnVerticalBorder={true}         
                hideFooter={hideFooter}   
                components={{ Toolbar: GridToolbar }}
                slots={{
                    noRowsOverlay: () => (
                        <MyDiv style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 400px)' }}>
                            <HeadingFour>No data available</HeadingFour>
                        </MyDiv>
                    )
                }}
                getRowClassName={getRowClassName}
                {...props}
            />
        </Box>
    );
};

CustomDataGrid.propTypes = {
    rows : PropTypes.array,
    columns : PropTypes.array,
    loading : PropTypes.bool,
    checkboxSelection : PropTypes.bool,
    density : PropTypes.string,
    disableSelectionOnClick : PropTypes.bool,
    disableColumnMenu : PropTypes.bool,
    paginationMode : PropTypes.string,
    pageLimit : PropTypes.number,
    page : PropTypes.number,
    total : PropTypes.number,
    rowHeight : PropTypes.number,
    hideFooterPagination : PropTypes.bool,
    hideFooter : PropTypes.bool,
    onPageChange : PropTypes.func ,
    onPageSizeChange : PropTypes.func ,
    handleCellEdit : PropTypes.func ,
}

export default CustomDataGrid;