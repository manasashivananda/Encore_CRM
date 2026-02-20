import React from "react";
import { DataGrid } from "@mui/x-data-grid";
import Pagination from "@mui/material/Pagination";
import PropTypes from "prop-types";
import { MyDiv } from "./Components";

function CustomPagination({ page, pageCount, onPageChange }) {
  return (
    // <MyDiv className="reactPaginate d-flex justify-content-center align-item-center">
      <Pagination
        // color="primary"
        // shape="rounded"
        page={page + 1}
        count={pageCount}
        onChange={(e, value) => onPageChange(value - 1)}
      />
    // </MyDiv>
  );
}

function CommonDataGrid({
  rows = [],
  columns = [],
  rowCount = 0,
  loading = false,
  paginationModel,
  onPaginationModelChange,
  sortModel,
  onSortModelChange,
  filterModel,
  onFilterModelChange,
  getRowId = row => row._id,
  initialSortField = "id",
  initialSortOrder = "asc",
  getRowClassName = () => {},
  height,
  width,
  sx = {},
  rowHeight = "",
  onKeyDown,
  paginationMode= "server",
  sortingMode= "server",
  filterMode= "server"
}) {
  return (
    <div style={{ height, width }}>
      <DataGrid
        rows={rows}
        columns={columns}
        rowCount={rowCount}
        loading={loading}
        paginationMode={paginationMode}
        sortingMode={sortingMode}
        filterMode={filterMode}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        filterModel={filterModel}
        onFilterModelChange={onFilterModelChange}
        getRowId={getRowId}
        disableRowSelectionOnClick
        sortingOrder={["desc", "asc"]}
        initialState={{
          sorting: {
            sortModel: [{ field: initialSortField, sort: initialSortOrder }],
          },
        }}
        getRowClassName={getRowClassName}
        getRowHeight={() => rowHeight}
        sx={{
          '& .MuiDataGrid-footerContainer' : {
            justifyContent : 'center'
          },
          '& .MuiPaginationItem-root.Mui-selected': {
            backgroundColor : 'var(--primary)',
            color: '#fff'
          },
          ...sx
        }}
        localeText={{
          columnMenuSortAsc: 'Sort A → Z',
          columnMenuSortDesc: 'Sort Z → A',
          columnMenuFilter: 'Filter',
          columnMenuHideColumn: 'Hide column',
          columnMenuManageColumns: 'Manage columns'
        }}
        onKeyDown={onKeyDown}
        // ⭐ Custom Pagination
        slots={{
          pagination: CustomPagination
        }}
        slotProps={{
          pagination: {
            page: paginationModel.page,
            pageCount: Math.ceil(rowCount / paginationModel.pageSize),
            onPageChange: (newPage) =>
              onPaginationModelChange({ ...paginationModel, page: newPage }),
          }
        }}
      />
    </div>
  );
}

export default CommonDataGrid;

CommonDataGrid.propTypes = {
  rows: PropTypes.any,
  columns: PropTypes.any,
  rowCount: PropTypes.any,
  loading: PropTypes.any,
  paginationModel: PropTypes.any,
  onPaginationModelChange: PropTypes.any,
  sortModel: PropTypes.any,
  onSortModelChange: PropTypes.any,
  filterModel: PropTypes.object,
  onFilterModelChange: PropTypes.func,
  getRowId: PropTypes.any,
  initialSortField: PropTypes.any,
  initialSortOrder: PropTypes.any,
  getRowClassName: PropTypes.func,
  height: PropTypes.string,
  width: PropTypes.string,
  sx: PropTypes.object,
  rowHeight: PropTypes.any,
  onKeyDown: PropTypes.func
};