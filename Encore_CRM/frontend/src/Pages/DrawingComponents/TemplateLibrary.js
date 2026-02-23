/**
 * TemplateLibrary — Browse and select drawing templates by Part Group → Part Class
 *
 * AWF Changes (20-Feb-2026):
 * - Added AWF part group support alongside existing Flashing flow
 * - AWF does NOT have Create Drawing, My Library, or Customer Library — only its part classes
 * - Some AWF part classes have sub-categories (e.g., Downpipe → Standard D/P, Manual D/P)
 *   shown as toggle buttons at the top of the gallery; first toggle is auto-selected
 * - Part classes without sub-categories (Clips & Pops, Rollforming) show templates directly
 * - Default group is Flashing (from "Add Design"); user selects AWF manually from dropdown
 * - Flashing flow is completely unchanged — all AWF logic is guarded by selectedGroup === 'AWF'
 *   or hasSubCategories (which is always false for Flashing)
 */
import React, { useEffect, useState, useMemo, startTransition, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import swal from 'sweetalert2';
import { logger } from '../../utils/logger';
import { API_BASE_URL, tokenManager, userManager } from '../../config/api.config';
import { withErrorBoundary } from '../../components/ErrorBoundary';
import '../../styles/TemplateLibrary.scss';
import PreviewCanvas from './PreviewThumbnail';
import { ArrowLeft, Trash2 } from 'lucide-react';

// Moved token reading inside functions to avoid stale token issues
const RolePermission = userManager.getRole();
const USER_ID = userManager.getUserId();


// SkeletonLoader 
const SkeletonLoader = ({ width, height, style = {} }) => (
  <div
    className="skeleton"
    style={{ width, height, ...style }}
    aria-hidden="true"
  />
);

const TemplateLibrary = () => {
  const navigate = useNavigate();
  const { order_unique_id } = useParams();
  const location = useLocation();
  //code change by rahul
  const previousPage = location.state?.currentPage || 'designers';

  // Order-related state
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [promiseDate, setPromiseDate] = useState(null);
  const [enteredDate, setEnteredDate] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState(null);

  
  // State for editing template names
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false); // Prevent rapid saves

  // Loading & error states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState('');

  // Template library state
  const [groupClassMap, setGroupClassMap] = useState({});
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  // AWF sub-category state — tracks selected sub-category within a part class
  // Navigation: Part Group (AWF) → Part Class (Downpipe) → Sub-Category (Standard D/P)
  const [subCategoryMap, setSubCategoryMap] = useState({});      // From meta API: { AWF: { Downpipe: ['Standard D/P', ...] } }
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);  // Currently selected sub-category button
  const [libraryType, setLibraryType] = useState('my');

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Custom dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [pageSize] = useState(12); // First load shows 12, scroll loads more
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef(null);

  // Responsive canvas dimensions based on viewport width
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 120, height: 90, fontSize: 9 });

  useEffect(() => {
    const updateCanvasDimensions = () => {
      const viewportWidth = window.innerWidth;

      if (viewportWidth >= 1920) {
        // Large desktop/4K monitors - 4 columns, need smaller canvas
        setCanvasDimensions({ width: 180, height: 135, fontSize: 12 });
      } else if (viewportWidth >= 1600) {
        // HD+ Desktop (1600x1134) - 3 columns, larger cards need bigger canvas
        setCanvasDimensions({ width: 200, height: 150, fontSize: 12 });
      } else if (viewportWidth >= 1366) {
        // HD Laptop/Small Desktop - 3 columns
        setCanvasDimensions({ width: 170, height: 130, fontSize: 11 });
      } else if (viewportWidth >= 1024) {
        // iPad Landscape/Small Laptop - 3 columns
        setCanvasDimensions({ width: 140, height: 105, fontSize: 10 });
      } else if (viewportWidth >= 768) {
        // iPad Portrait/Tablet - 2 columns
        setCanvasDimensions({ width: 120, height: 90, fontSize: 9 });
      } else {
        // Mobile - 2 columns
        setCanvasDimensions({ width: 100, height: 75, fontSize: 8 });
      }
    };

    // Initial calculation
    updateCanvasDimensions();

    // Update on resize
    window.addEventListener('resize', updateCanvasDimensions);
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, []);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.custom-select-container')) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Load order-related state from location or localStorage
  useEffect(() => {
    logger.debug('🔍 TemplateLibrary location.state received:', location.state);

    let groupSet = false;
    let classSet = false;

    if (location.state && typeof location.state === 'object') {
      // Get saved state from localStorage as fallback for empty values
      const savedState = JSON.parse(localStorage.getItem('orderState') || '{}');

      // Only save to localStorage if we have meaningful data (not just partClass)
      if (location.state.orderNumber || location.state.customerName) {
        localStorage.setItem('orderState', JSON.stringify(location.state));
      }

      setOrderNumber(location.state.orderNumber || savedState.orderNumber || '');
      setCustomerName(location.state.customerName || savedState.customerName || '');
      setCustomerId(location.state.customerId || savedState.customerId || '');
      setOrderId(location.state.orderId || savedState.orderId || '');
      setCustomerPoNumber(location.state.customerPoNumber || savedState.customerPoNumber || localStorage.getItem('customerPoNumber') || '');
      setDeliveryDate(location.state.orderDeliveryDate || null);
      setEnteredDate(location.state.created_str || null);

      // Set partGroup and partClass if provided (from Finish & Add New)
      // But wait until groupClassMap is loaded
      logger.debug('partGroup from state:', location.state.partGroup);
      logger.debug('partClass from state:', location.state.partClass);

      if (location.state.partGroup) {
        logger.debug('Setting selectedGroup to:', location.state.partGroup);
        setSelectedGroup(location.state.partGroup);
        groupSet = true;
      } else {
        // Check localStorage as fallback - safe check
        try {
          const lastPartGroup = localStorage.getItem('lastPartGroup');
          if (lastPartGroup) {
            logger.debug('Setting selectedGroup from localStorage:', lastPartGroup);
            setSelectedGroup(lastPartGroup);
            groupSet = true;
          }
        } catch (error) {
          // Silently fail if localStorage is not available
          logger.debug('Could not read lastPartGroup from localStorage:', error);
        }
      }

      if (location.state.partClass) {
        logger.debug('Setting selectedClass to:', location.state.partClass);
        setSelectedClass(location.state.partClass);
        classSet = true;
        // Force a re-render to ensure highlighting updates
        setTimeout(() => {
          setSelectedClass(location.state.partClass);
        }, 100);
      } else {
        // Check localStorage as fallback - safe check
        try {
          const lastPartClass = localStorage.getItem('lastPartClass');
          if (lastPartClass) {
            logger.debug('Setting selectedClass from localStorage:', lastPartClass);
            setSelectedClass(lastPartClass);
            classSet = true;
            // Force a re-render to ensure highlighting updates
            setTimeout(() => {
              setSelectedClass(lastPartClass);
            }, 100);
          }
        } catch (error) {
          // Silently fail if localStorage is not available
          logger.debug('Could not read lastPartClass from localStorage:', error);
        }
      }
    } else {
      try {
        const savedState = JSON.parse(localStorage.getItem('orderState') || '{}');
        setOrderNumber(savedState.orderNumber || '');
        setCustomerName(savedState.customerName || '');
        setCustomerId(savedState.customerId || '');
        setOrderId(savedState.orderId || '');
        setDeliveryDate(savedState.orderDeliveryDate || null);
        setEnteredDate(savedState.created_str || null);

        // Also check for partGroup and partClass in saved state
        if (savedState.partGroup) {
          setSelectedGroup(savedState.partGroup);
          groupSet = true;
        } else {
          // Check localStorage as fallback - safe check
          try {
            const lastPartGroup = localStorage.getItem('lastPartGroup');
            if (lastPartGroup) {
              logger.debug('Setting selectedGroup from localStorage (fallback):', lastPartGroup);
              setSelectedGroup(lastPartGroup);
              groupSet = true;
            }
          } catch (error) {
            // Silently fail if localStorage is not available
            logger.debug('Could not read lastPartGroup from localStorage (fallback):', error);
          }
        }

        if (savedState.partClass) {
          setSelectedClass(savedState.partClass);
          classSet = true;
        } else {
          // Check localStorage as fallback - safe check
          try {
            const lastPartClass = localStorage.getItem('lastPartClass');
            if (lastPartClass) {
              logger.debug('Setting selectedClass from localStorage (fallback):', lastPartClass);
              setSelectedClass(lastPartClass);
              classSet = true;
            }
          } catch (error) {
            // Silently fail if localStorage is not available
            logger.debug('Could not read lastPartClass from localStorage (fallback):', error);
          }
        }
      } catch {
        // Invalid localStorage data
      }
    }

    // Set defaults if no state was found
    if (!groupSet) {
      logger.debug('No partGroup found, setting default to Flashing');
      setSelectedGroup('Flashing');
    }
    if (!classSet) {
      logger.debug('No partClass found, setting default to My Library');
      setSelectedClass('My Library');
    }
  }, [location.state]);

  // Fetch groups/classes meta data
  useEffect(() => {
    setLoadingGroups(true);
    setGroupsError('');
    axios
      .get(`${API_BASE_URL}/api/templates/meta/groups-classes`)
      .then(res => {
        setGroupClassMap(res.data.data || {});
        setSubCategoryMap(res.data.subCategories || {});
      })
      .catch(err => {
        setGroupsError('Failed to load groups/classes.');
        logger.error('Failed to fetch groups/classes:', err);
        setGroupClassMap({});
      })
      .finally(() => setLoadingGroups(false));
  }, []);
  
  // Validate selectedGroup when groupClassMap loads
  useEffect(() => {
    if (Object.keys(groupClassMap).length > 0 && selectedGroup) {
      // Check if the selectedGroup exists in groupClassMap
      if (!groupClassMap[selectedGroup]) {
        logger.debug('Selected group not found in groupClassMap, clearing selection');
        setSelectedGroup('');
        setSelectedClass('');
      } else {
        // AWF does not support Create Drawing / My Library / Customer Library — reset if one of these is selected
        const drawingOnlyClasses = ['Create Drawing', 'My Library', 'Customer Library'];
        if (selectedGroup === 'AWF' && drawingOnlyClasses.includes(selectedClass)) {
          logger.debug('AWF does not support', selectedClass, '— resetting to first AWF class');
          const firstClass = groupClassMap[selectedGroup]?.[0];
          setSelectedClass(firstClass || '');
        }
        // Group is valid, check if we need to restore class from location/localStorage
        else if (!selectedClass && location.state?.partClass) {
          logger.debug('Restoring partClass from location.state after groupClassMap loaded');
          setSelectedClass(location.state.partClass);
        } else if (!selectedClass) {
          let restored = false;
          try {
            const lastPartClass = localStorage.getItem('lastPartClass');
            if (lastPartClass) {
              // Don't restore drawing-only classes for AWF
              if (selectedGroup === 'AWF' && drawingOnlyClasses.includes(lastPartClass)) {
                logger.debug('Skipping invalid localStorage class for AWF:', lastPartClass);
              } else {
                logger.debug('Restoring partClass from localStorage after groupClassMap loaded');
                setSelectedClass(lastPartClass);
                restored = true;
              }
            }
          } catch (error) {
            logger.debug('Could not restore partClass from localStorage:', error);
          }
          // Set sensible default if nothing was restored
          if (!restored) {
            if (selectedGroup === 'AWF') {
              // AWF defaults to first part class (e.g., Downpipe)
              const firstClass = groupClassMap[selectedGroup]?.[0];
              if (firstClass) setSelectedClass(firstClass);
            } else {
              // Flashing and other groups default to My Library
              setSelectedClass('My Library');
            }
          }
        }
      }
    }
  }, [groupClassMap, selectedGroup, location.state]);
  
  // Debug selectedClass changes
  useEffect(() => {
    logger.debug('🎯 SelectedClass changed to:', selectedClass);
    logger.debug('🎯 Current selectedGroup:', selectedGroup);
  }, [selectedClass, selectedGroup]);

  // Check if the currently selected part class has sub-categories (e.g., Downpipe → ['Standard D/P', 'Manual D/P'])
  const currentSubCategories = useMemo(() => {
    if (!selectedGroup || !selectedClass) return [];
    return subCategoryMap?.[selectedGroup]?.[selectedClass] || [];
  }, [subCategoryMap, selectedGroup, selectedClass]);

  const hasSubCategories = currentSubCategories.length > 0;

  // Auto-select the first sub-category when class changes (toggle behavior)
  useEffect(() => {
    if (currentSubCategories.length > 0) {
      setSelectedSubCategory(currentSubCategories[0]);
    } else {
      setSelectedSubCategory(null);
    }
  }, [selectedGroup, selectedClass, currentSubCategories]);

  // Function to fetch templates with pagination
  const fetchTemplates = useCallback((pageNum = 1, append = false) => {
    if (!selectedGroup || !selectedClass) {
      setTemplates([]);
      return;
    }

    // Skip fetching for 'Create Drawing'
    if (selectedClass === 'Create Drawing') {
      setTemplates([]);
      return;
    }

    // AWF does not support library views — block fetches for My Library / Customer Library
    if (selectedGroup === 'AWF' && ['My Library', 'Customer Library'].includes(selectedClass)) {
      setTemplates([]);
      return;
    }

    // For AWF sub-categories: if the current class has sub-categories but none is selected, don't fetch
    const classSubCategories = subCategoryMap?.[selectedGroup]?.[selectedClass] || [];
    if (classSubCategories.length > 0 && !selectedSubCategory) {
      setTemplates([]);
      return;
    }

    // Check if user should be able to access templates
    if (selectedClass === 'Customer Library' && !customerId) {
      setTemplatesError('Customer must be selected to view Customer Library.');
      setTemplates([]);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingTemplates(true);
    }
    setTemplatesError('');

    const params = {
      page: pageNum,
      limit: pageSize
    };

    // Determine API endpoint and params based on part group
    let apiUrl;

    if (selectedGroup === 'AWF') {
      // AWF uses its own product catalog API
      apiUrl = `${API_BASE_URL}/api/awf-products`;
      params.part_class = selectedClass;
      if (selectedSubCategory) {
        params.sub_category = selectedSubCategory;
      }
    } else {
      // Flashing and other groups use the template library API
      apiUrl = `${API_BASE_URL}/api/template-library`;

      if (['My Library', 'Customer Library'].includes(selectedClass)) {
        // Library views: use library_type parameter
        params.library_type = libraryType === 'my' ? 'my_library' : 'customer_library';
        if (libraryType === 'customer' && customerId) {
          params.customer_id = customerId;
        } else if (libraryType === 'my') {
          params.owner_user_id = USER_ID;
        }
      } else {
        // Part class views (Gutters, Aprons, etc.): use part_group and part_class
        params.library_type = 'part_class';
        params.part_group = selectedGroup;
        params.part_class = selectedSubCategory || selectedClass;
      }
    }

    // Debug logging
    logger.debug('=== TEMPLATE LIBRARY FETCH DEBUG ===');
    logger.debug('API URL:', apiUrl);
    logger.debug('Fetch params:', params);
    logger.debug('Selected Group:', selectedGroup);
    logger.debug('Selected Class:', selectedClass);
    logger.debug('Selected SubCategory:', selectedSubCategory);
    logger.debug('Page:', pageNum);
    logger.debug('================================');

    const token = tokenManager.getToken();
    axios
      .get(apiUrl, {
        params,
        headers: {
          'x-access-token': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      .then(res => {
        const responseData = Array.isArray(res.data.data) ? res.data.data : [];
        const pagination = res.data.pagination || {};
        logger.debug('Entries received:', responseData.length);
        logger.debug('Pagination info:', pagination);

        let templatesData;

        if (selectedGroup === 'AWF') {
          // AWF products — catalog entries with name, description, image
          templatesData = responseData.map(product => ({
            _id: product._id,
            name: product.name,
            description: product.description,
            part_class: product.part_class,
            sub_category: product.sub_category,
            image: product.image,
            _isAWFProduct: true // Flag to differentiate in rendering
          }));
        } else {
          // Flashing template library entries — extract template data from template_id field
          templatesData = responseData
            .filter(entry => entry.template_id)
            .map(entry => ({
              ...entry.template_id,
              _libraryEntryId: entry._id,
              _libraryCreatedAt: entry.createdAt
            }));
        }

        logger.debug('Templates/products processed:', templatesData.length);

        // Update hasMore based on pagination response
        setHasMore(pagination.hasMore !== undefined ? pagination.hasMore : templatesData.length === pageSize);

        if (append) {
          setTemplates(prev => [...prev, ...templatesData]);
        } else {
          setTemplates(templatesData);
        }
      })
      .catch(err => {
        setTemplatesError('Failed to load templates.');
        logger.error('Failed to fetch template library:', err);
        if (!append) {
          setTemplates([]);
        }
      })
      .finally(() => {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoadingTemplates(false);
        }
      });
  }, [selectedGroup, selectedClass, libraryType, customerId, customerName, pageSize, subCategoryMap, selectedSubCategory]);

  // Fetch templates on group, class, and library type change
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchTemplates(1, false);
  }, [selectedGroup, selectedClass, libraryType, customerId, fetchTemplates]);

  // Only show AWF and Flashing in the dropdown — other groups still work if navigated directly
  const visibleGroups = ['AWF', 'Flashing'];
  const partGroups = Object.keys(groupClassMap).filter(g =>
    visibleGroups.length ? visibleGroups.includes(g) : true
  );

  // AWF shows only its part classes (no Create Drawing / My Library / Customer Library)
  const partClasses = selectedGroup
    ? selectedGroup === 'AWF'
      ? [...(groupClassMap[selectedGroup] || [])]
      : [
          'Create Drawing',
          'My Library',
          ...(customerId ? ['Customer Library'] : []),
          ...(groupClassMap[selectedGroup] || [])
        ]
    : [];

  // Filter templates by search term (case-insensitive match on name)
  const filteredBySearch = useMemo(() => {
    if (!searchTerm.trim()) return templates;
    const lowerTerm = searchTerm.toLowerCase();
    return templates.filter(tpl => {
      // Safely handle templates without names
      const templateName = (tpl.name || '').toLowerCase();
      return templateName.includes(lowerTerm);
    });
  }, [templates, searchTerm]);

  // Filter templates by selected group and class (skip filtering for library views)
  // AWF products are already filtered server-side by part_class and sub_category — no client filter needed
  const filteredTemplates = ['My Library', 'Customer Library'].includes(selectedClass)
    ? filteredBySearch
    : selectedGroup === 'AWF'
      ? filteredBySearch // AWF products already filtered by API params
      : filteredBySearch.filter(tpl => tpl.partGroup === selectedGroup && tpl.partClass === (selectedSubCategory || selectedClass));

  // Reset selection when filters or search change
  useEffect(() => {
    setSelectedTemplate(null);
  }, [selectedGroup, selectedClass, searchTerm]);

  // Infinite scroll handler
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      logger.debug('❌ Scroll container ref not found');
      return;
    }
    logger.debug('✅ Scroll container ref attached');

    const handleScroll = () => {
      // Check if we're near the bottom (within 100px)
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 100;

      logger.debug('📜 Scroll event:', { scrollTop, scrollHeight, clientHeight, nearBottom, hasMore, loadingMore, loadingTemplates, page });

      if (nearBottom && hasMore && !loadingMore && !loadingTemplates) {
        const nextPage = page + 1;
        logger.debug('🚀 Loading more templates, page:', nextPage);
        setPage(nextPage);
        fetchTemplates(nextPage, true);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loadingTemplates, page, fetchTemplates]);

  // Memoized back navigation handler
  const handleBackClick = useCallback(() => {
    if (!orderId) {
      swal.fire({
        text: 'Order ID is missing, cannot navigate to order details.',
        icon: 'error',
        title: 'Error'
      });
      return;
    }
    //Code change By Rahul
    navigate(`/${previousPage}/${orderId}`, {
      state: { orderNumber, customerName, customerId, orderId, deliveryDate: promiseDate, enteredDate, currentPage: previousPage },
    });
  }, [navigate, orderId, orderNumber, customerName, customerId, promiseDate, enteredDate, previousPage]);
  // Handle saving template name
  const handleSaveTemplateName = useCallback(async (templateId) => {
    // Prevent rapid saves
    if (isSavingName) {
      logger.debug('Save already in progress, ignoring');
      return;
    }

    if (!editingName && editingName !== '') {
      // If empty or unchanged, just exit edit mode
      setEditingTemplateId(null);
      setEditingName('');
      return;
    }

    // Sanitize and validate input
    const sanitizedName = editingName.trim().substring(0, 100); // Limit to 100 chars
    if (!/^[a-zA-Z0-9\s\-_.,()]+$/.test(sanitizedName) && sanitizedName !== '') {
      swal.fire({
        text: 'Template name can only contain letters, numbers, spaces, and basic punctuation.',
        icon: 'error',
        title: 'Invalid Name'
      });
      return;
    }

    setIsSavingName(true); // Set saving flag

    try {
      const token = tokenManager.getToken();

      // First, find the template in our local state
      const templateToUpdate = templates.find(t => t._id === templateId);
      if (!templateToUpdate) {
        swal.fire({
          text: 'Template Not Found',
          icon:'error',
          title:'error'
        });
        return;
      }

      // Update library entry with just the name
      await axios.put(
        `${API_BASE_URL}/api/template-library/${templateId}`,
        { name: sanitizedName },
        {
          headers: {
            'x-access-token': token,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Update local state
      setTemplates(prev => prev.map(t => 
        t._id === templateId ? { ...t, name: editingName } : t
      ));
      
      // Update selected template if it's the one being edited
      if (selectedTemplate?._id === templateId) {
        setSelectedTemplate(prev => ({ ...prev, name: editingName }));
      }
      
      swal.fire({
        title:"Success",
        text:"Template name has been successfully updated.",
        icon:"success"
      })
      setEditingTemplateId(null);
      setEditingName('');
    } catch (error) {
      logger.error('Failed to update template name:', error);
      swal.fire({
        title:'error',
        text:'Failed to update template name',
        icon:"error"
      })
    } finally {
      setIsSavingName(false); // Always reset saving flag
    }
  }, [editingName, selectedTemplate, templates, isSavingName]);

  // Handle deleting a drawing from library
  const handleDeleteFromLibrary = useCallback(async (libraryEntryId, templateName, e) => {
    // Stop event propagation to prevent card selection
    e.stopPropagation();

    try {
      const token = tokenManager.getToken();

      await axios.delete(`${API_BASE_URL}/api/template-library/${libraryEntryId}`, {
        headers: { 'x-access-token': token }
      });

      // Remove from state
      setTemplates(prev => prev.filter(t => t._libraryEntryId !== libraryEntryId));

      // Clear selection if deleted template was selected
      if (selectedTemplate?._libraryEntryId === libraryEntryId) {
        setSelectedTemplate(null);
      }

      logger.info(`Library entry deleted: ${libraryEntryId}`);
    } catch (error) {
      logger.error('Failed to delete library entry:', error);
      swal.fire({
        text: 'Failed to remove from library',
        icon: 'error',
        title: 'Error'
      });
    }
  }, [selectedTemplate]);

  return (
    <div className="template-container">
      <div className="template-header">
        <button
          className="btn black"
          aria-label="Back to Order Details"
          disabled={!orderId}
          onClick={handleBackClick}
        >
          <ArrowLeft size={16} style={{ marginRight: '6px' }} />
          Back
        </button>

        <input
          className="search-box"
          aria-label="Search templates"
          placeholder="Search by template name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>

      {loadingGroups ? (
        // Skeleton for sidebar groups/classes
        <div className="template-layout">
          <div className="template-sidebar" aria-label="Loading sidebar">
            <SkeletonLoader width="100%" height={20} style={{ marginBottom: 10 }} />
            <SkeletonLoader width="100%" height={150} />
          </div>
          <div className="template-gallery" aria-label="Loading templates">
            <SkeletonLoader width="100%" height={300} />
          </div>
          <div className="template-preview-pane" aria-label="Loading preview pane">
            <SkeletonLoader width="100%" height={300} />
          </div>
        </div>
      ) : (
        <div className="template-layout">
          <div className="template-sidebar">
            <label>Part Group</label>
            <div className="custom-select-container">
              <div 
                className={`custom-select-header ${loadingGroups ? 'disabled' : ''}`}
                onClick={() => !loadingGroups && setIsDropdownOpen(!isDropdownOpen)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !loadingGroups) {
                    setIsDropdownOpen(!isDropdownOpen);
                  }
                }}
              >
                <span>{selectedGroup || 'Select Group'}</span>
                <span className={`arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
              </div>
              {isDropdownOpen && (
                <div className="custom-select-dropdown">
                  <div 
                    className="dropdown-item"
                    onClick={() => {
                      setSelectedGroup('');
                      setSelectedClass('');
                      setSelectedTemplate(null);
                      setPage(1);
                      setIsDropdownOpen(false);
                    }}
                  >
                    Select Group
                  </div>
                  {partGroups.map(g => (
                    <div
                      key={g}
                      className={`dropdown-item ${selectedGroup === g ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedGroup(g);
                        // AWF has no library views — default to first part class; others default to My Library
                        setSelectedClass(g === 'AWF' ? (groupClassMap[g]?.[0] || '') : 'My Library');
                        setSelectedTemplate(null);
                        setPage(1);
                        setIsDropdownOpen(false);
                      }}
                    >
                      {g}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedGroup && (
              <>
                <label>Part Class</label>
                <ul className="class-list" role="list">
                  {partClasses.map(cls => (
                    <li
                      key={cls}
                      role="button"
                      tabIndex={0}
                      className={`${selectedClass === cls ? 'active' : ''} ${cls === 'Create Drawing' ? 'create-drawing' : ''}`}
                      data-selected={selectedClass === cls}
                      onClick={() => {
                        if (cls === 'Create Drawing') {
                          if (!customerName) {
                            swal.fire({
                              title:"warning",
                              text:"Customer name is still loading. Please wait a moment.",
                              icon:"warning"
                            })
                            return;
                          }
                          // Get the current partClass context - use the previously selected class or first available class
                          const currentPartClass = selectedClass && !['Create Drawing', 'My Library', 'Customer Library'].includes(selectedClass)
                            ? selectedClass 
                            : groupClassMap[selectedGroup]?.[0] || 'Aprons';
                          
                          // Store current selection before navigating
                          if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                          if (currentPartClass) localStorage.setItem('lastPartClass', currentPartClass);
                          
                          startTransition(() => {
                            //code change by rahul
                            {/* Quotation check handled */}
                              // Track what tab was selected before clicking Create Drawing
                              // Return to the same tab after "Finish & Add New"
                              // If on "Create Drawing" tab, default to "My Library"
                              const returnToPartClass = selectedClass === 'Create Drawing' ? 'My Library' : selectedClass;
                              navigate(
                                `/${orderNumber.startsWith("IN") ? "orders" : "quotes"}/${orderNumber}/drawings/new?partGroup=${encodeURIComponent(selectedGroup)}&partClass=${encodeURIComponent(currentPartClass)}`,
                                { state: { orderNumber, customerName, customerId, customerPoNumber, deliveryDate, previousPage, orderId, fromCreateDrawing: true, returnToPartClass } }
                              );
                          });
                        } else if (cls === 'My Library') {
                          setLibraryType('my');
                          setSelectedClass(cls);
                          setSelectedTemplate(null);
                          setPage(1);
                        } else if (cls === 'Customer Library') {
                          if (!customerId) {
                            swal.fire({
                              title:"Warning",
                              text:"Customer must be selected to view Customer Library.",
                              icon:"warning"
                            })
                            return;
                          }
                          setLibraryType('customer');
                          setSelectedClass(cls);
                          setSelectedTemplate(null);
                          setPage(1);
                        } else {
                          setSelectedClass(cls);
                          setSelectedTemplate(null);
                          setPage(1);
                        }
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}
                      aria-pressed={selectedClass === cls}
                    >
                      {cls === 'Create Drawing' ? ' Create Drawing' : cls}
                    </li>
                  ))}
                </ul>
              </>
            )}

          </div>

          <div
            className="template-gallery"
            aria-live="polite"
            aria-busy={loadingTemplates}
            ref={scrollContainerRef}
          >
            {/* Hide gallery header when sub-category toggles are visible — the toggle itself shows the selection */}
            {!hasSubCategories && (
              <div className="gallery-header">
                {selectedClass === 'My Library' ? 'My Library' :
                 selectedClass === 'Customer Library' ? 'Customer Library' : 'Templates'}
                {selectedClass === 'Customer Library' && customerName && ` - ${customerName}`}
              </div>
            )}

            {/* AWF Sub-Category Toggles — always visible when a part class has sub-categories */}
            {hasSubCategories && (
              <div className="sub-category-toggles">
                {currentSubCategories.map(subCat => (
                  <button
                    key={subCat}
                    className={`sub-category-toggle ${selectedSubCategory === subCat ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSubCategory(subCat);
                      setSelectedTemplate(null);
                      setPage(1);
                    }}
                  >
                    {subCat}
                  </button>
                ))}
              </div>
            )}

            {/* Template grid shows when sub-category is selected (or not needed) */}
            {(!hasSubCategories || selectedSubCategory) && (
            <>
            {loadingTemplates ? (
              // Skeleton for template grid
              <div className="template-grid" aria-label="Loading templates list">
                {[...Array(pageSize)].map((_, i) => (
                  <SkeletonLoader
                    key={i}
                    width={140}
                    height={100}
                    style={{ marginBottom: 10, borderRadius: 6 }}
                  />
                ))}
              </div>
            ) : (
              <>
                {templatesError && <p className="error-message">{templatesError}</p>}

                <div className="template-grid">
                    {filteredTemplates.length ? (
                      filteredTemplates.map(tpl => tpl._isAWFProduct ? (
                      /* ========== AWF Product Card — image + name only ========== */
                      <div
                        key={tpl._id}
                        className={`template-card awf-product-card ${selectedTemplate?._id === tpl._id ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedTemplate(tpl);
                          if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                          if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);
                        }}
                        onDoubleClick={() => {
                          startTransition(() => {
                            if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                            if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);
                            navigate(
                              `/${orderNumber.startsWith("IN") ? "orders" : "quotes"}/${orderNumber}/awf/select-materials?productId=${tpl._id}`,
                              {
                                state: {
                                  orderNumber, customerName, customerId, customerPoNumber, orderId,
                                  name: tpl.name,
                                  productId: tpl._id,
                                  productImage: tpl.image || null,
                                  partGroup: 'AWF',
                                  partClass: tpl.part_class,
                                  subCategory: tpl.sub_category,
                                  _isAWFProduct: true,
                                  previousPage: previousPage,
                                }
                              }
                            );
                          });
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}
                        aria-pressed={selectedTemplate?._id === tpl._id}
                      >
                        {/* Product image — placeholder until S3 images are uploaded */}
                        <div className="awf-product-icon">
                          {tpl.image
                            ? <img src={tpl.image} alt={tpl.name} className="awf-product-img" />
                            : <span className="awf-placeholder-icon">&#9634;</span>
                          }
                        </div>
                        <div className="template-title">{tpl.name}</div>
                      </div>
                    ) : (
                      /* ========== Flashing Template Card (existing) ========== */
                      <div
                        key={tpl._id}
                        className={`template-card ${selectedTemplate?._id === tpl._id ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedTemplate(tpl);
                          if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                          if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);
                        }}
                        onDoubleClick={() => {
                          startTransition(() => {
                            if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                            if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);

                            logger.debug('=== DOUBLE CLICK NAVIGATION DEBUG ===');
                            logger.debug('tpl object:', tpl);
                            logger.debug('tpl.firstSegmentAngle:', tpl.firstSegmentAngle);
                            logger.debug('tpl.flipH:', tpl.flipH);
                            logger.debug('tpl.flipV:', tpl.flipV);
                            logger.debug('====================================');

                            {/* Quotation check handled */}
                            navigate(
                              `/${orderNumber.startsWith("IN") ? "orders" : "quotes"}/${orderNumber}/drawings/new?templateId=${tpl._id}`,
                              {
                                state: {
                                  orderNumber,
                                  customerName,
                                  customerId,
                                  customerPoNumber,
                                  orderId,
                                  name: tpl.name,
                                  lengths: tpl.lengths,
                                  angles: tpl.angles,
                                  direction: tpl.direction,
                                  reverseColor: tpl.reverseColor,
                                  isTaper: tpl.isTaper,
                                  farLengths: tpl.farLengths,
                                  farAngles: tpl.farAngles,
                                  nearLengths: tpl.nearLengths,
                                  nearAngles: tpl.nearAngles,
                                  previewFar: tpl.previewFar,
                                  previewNear: tpl.previewNear,
                                  partGroup: tpl.partGroup,
                                  partClass: tpl.partClass,
                                  firstSegmentAngle: tpl.firstSegmentAngle,
                                  flipH: tpl.flipH,
                                  flipV: tpl.flipV,
                                  labelOffsets: tpl.labelOffsets,
                                  startFoldType: tpl.startFoldType,
                                  startFoldDirection: tpl.startFoldDirection,
                                  startFoldLength: tpl.startFoldLength,
                                  startFoldGap: tpl.startFoldGap,
                                  endFoldType: tpl.endFoldType,
                                  endFoldDirection: tpl.endFoldDirection,
                                  endFoldLength: tpl.endFoldLength,
                                  endFoldGap: tpl.endFoldGap,
                                  previousPage: previousPage,
                                }}
                            );
                          });
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}
                        aria-pressed={selectedTemplate?._id === tpl._id}
                      >
                        {/* Delete icon - show for My Library without permission check, otherwise check permission */}
                        {tpl._libraryEntryId && (selectedClass === 'My Library' || (RolePermission && RolePermission.SaveDrawingLibrary && RolePermission.SaveDrawingLibrary.edit === "1")) && (
                          <button
                            className="delete-icon-btn"
                            onClick={(e) => handleDeleteFromLibrary(tpl._libraryEntryId, tpl.name, e)}
                            title="Remove from library"
                            aria-label="Remove from library"
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: 'rgba(210, 37, 48, 0.9)',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 10,
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(210, 37, 48, 1)';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(210, 37, 48, 0.9)';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            <Trash2 size={14} color="white" />
                          </button>
                        )}
                        <PreviewCanvas
                          lines={tpl.lengths}
                          angles={tpl.angles}
                          direction={tpl.direction}
                          firstSegmentAngle={tpl.firstSegmentAngle}
                          flipH={tpl.flipH}
                          flipV={tpl.flipV}
                          width={canvasDimensions.width}
                          height={canvasDimensions.height}
                          hidePoints
                          thinStroke
                          fontSize={canvasDimensions.fontSize}
                        />
                        {editingTemplateId === tpl._id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleSaveTemplateName(tpl._id)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.target.blur();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Enter name"
                            style={{
                              fontSize: '10px',
                              color: '#d22530',
                              fontWeight: '600',
                              textAlign: 'center',
                              border: '1px solid #d22530',
                              borderRadius: '3px',
                              padding: '2px 4px',
                              marginTop: '2px',
                              width: '90%',
                              background: 'white'
                            }}
                            autoFocus
                          />
                        ) : (
                          <div
                            className="template-title"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTemplateId(tpl._id);
                              setEditingName(tpl.name || '');
                            }}
                            style={{
                              cursor: 'pointer',
                              minHeight: '14px',
                              padding: '2px 4px'
                            }}
                            title="Click to edit name"
                          >
                            {tpl.name || <span style={{ color: '#999', fontStyle: 'italic' }}>Click to add name</span>}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    !loadingTemplates && <div className="no-templates">No templates available</div>
                  )}
                </div>
              </>
            )}

            {loadingMore && (
              <div className="loading-more" style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px',
                color: '#666'
              }}>
                <div className="spinner" style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #ddd',
                  borderTop: '2px solid #d22530',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginRight: '10px'
                }} />
                Loading more...
              </div>
            )}
            {!hasMore && filteredTemplates.length > 0 && (
              <div style={{
                textAlign: 'center',
                padding: '15px',
                color: '#999',
                fontSize: '13px'
              }}>
                All templates loaded
              </div>
            )}
            </>
            )}
          </div>

          <div className="template-preview-pane">
            {selectedTemplate ? (
              selectedTemplate._isAWFProduct ? (
                /* ========== AWF Product Preview — image + name ========== */
                <>
                  <div className="awf-preview-content">
                    {/* Product image — placeholder until S3 images are uploaded */}
                    <div className="awf-preview-icon">
                      {selectedTemplate.image
                        ? <img src={selectedTemplate.image} alt={selectedTemplate.name} className="awf-preview-img" />
                        : <span className="awf-placeholder-icon-lg">&#9634;</span>
                      }
                    </div>
                    <div className="template-title center" style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                      {selectedTemplate.name}
                    </div>
                  </div>
                  <button
                    className="btn green full"
                    onClick={() =>
                      startTransition(() => {
                        if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                        if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);
                        navigate(
                          `/${orderNumber.startsWith("IN") ? "orders" : "quotes"}/${orderNumber}/awf/select-materials?productId=${selectedTemplate._id}`,
                          {
                            state: {
                              orderNumber, customerName, customerId, customerPoNumber, orderId,
                              name: selectedTemplate.name,
                              productId: selectedTemplate._id,
                              productImage: selectedTemplate.image || null,
                              partGroup: 'AWF',
                              partClass: selectedTemplate.part_class,
                              subCategory: selectedTemplate.sub_category,
                              _isAWFProduct: true,
                              previousPage: previousPage,
                            }
                          }
                        );
                      })
                    }
                  >
                    Use It
                  </button>
                </>
              ) : (
                /* ========== Flashing Template Preview (existing) ========== */
                <>
                  <div style={{
                    margin: '40px 10px 20px 10px',
                    padding: '0',
                    overflow: 'visible',
                    minHeight: '150px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start'
                  }}>
                    <PreviewCanvas
                      lines={selectedTemplate.lengths}
                      angles={selectedTemplate.angles}
                      direction={selectedTemplate.direction}
                      firstSegmentAngle={selectedTemplate.firstSegmentAngle}
                      flipH={selectedTemplate.flipH}
                      flipV={selectedTemplate.flipV}
                      width={Math.round(canvasDimensions.width * 1.5)}
                      height={Math.round(canvasDimensions.height * 1.5)}
                      hidePoints={false}
                      thinStroke
                    />
                  </div>
                  <div
                    className="template-title center"
                    style={{
                      minHeight: '20px',
                      padding: '4px 8px'
                    }}
                  >
                    {selectedTemplate.name || <span style={{ color: '#999', fontStyle: 'italic' }}>No name</span>}
                  </div>
                  <button
                    className="btn green full"
                    onClick={() =>
                      startTransition(() => {
                        if (selectedGroup) localStorage.setItem('lastPartGroup', selectedGroup);
                        if (selectedClass) localStorage.setItem('lastPartClass', selectedClass);

                        logger.debug('=== USE IT BUTTON NAVIGATION DEBUG ===');
                        logger.debug('selectedTemplate object:', selectedTemplate);
                        logger.debug('====================================');

                        navigate(
                          `/${orderNumber.startsWith("IN") ? "orders" : "quotes"}/${orderNumber}/drawings/new?templateId=${selectedTemplate._id}`,
                          {
                            state: {
                              orderNumber,
                              customerName,
                              customerId,
                              customerPoNumber,
                              orderId,
                              name: selectedTemplate.name,
                              lengths: selectedTemplate.lengths,
                              angles: selectedTemplate.angles,
                              direction: selectedTemplate.direction,
                              reverseColor: selectedTemplate.reverseColor,
                              isTaper: selectedTemplate.isTaper,
                              farLengths: selectedTemplate.farLengths,
                              farAngles: selectedTemplate.farAngles,
                              nearLengths: selectedTemplate.nearLengths,
                              nearAngles: selectedTemplate.nearAngles,
                              previewFar: selectedTemplate.previewFar,
                              previewNear: selectedTemplate.previewNear,
                              partGroup: selectedTemplate.partGroup,
                              partClass: selectedTemplate.partClass,
                              firstSegmentAngle: selectedTemplate.firstSegmentAngle,
                              flipH: selectedTemplate.flipH,
                              flipV: selectedTemplate.flipV,
                              labelOffsets: selectedTemplate.labelOffsets,
                              startFoldType: selectedTemplate.startFoldType,
                              startFoldDirection: selectedTemplate.startFoldDirection,
                              startFoldLength: selectedTemplate.startFoldLength,
                              startFoldGap: selectedTemplate.startFoldGap,
                              endFoldType: selectedTemplate.endFoldType,
                              endFoldDirection: selectedTemplate.endFoldDirection,
                              endFoldLength: selectedTemplate.endFoldLength,
                              endFoldGap: selectedTemplate.endFoldGap,
                              previousPage: previousPage,
                            }
                          }
                        );
                      })
                    }
                  >
                    Use It
                  </button>
                </>
              )
            ) : (
              <div className="template-empty">Select a template</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default withErrorBoundary(TemplateLibrary, {
  name: 'TemplateLibrary',
  message: 'An error occurred while loading templates. Please try refreshing the page.'
});
