import Swal from 'sweetalert2';

const CustomSwal = {
    toast: {
        base: (message, timer = 3000, type = 'success' ) => {
            const backgrounds = {
                success: '#003399',
                error: '#cc3433',
                warning: '#ffc107',
                info: '#17a2b8'
            };

            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: timer,
                timerProgressBar: true,
                background: backgrounds[type] || '#003399',
                color: '#fff',
                customClass: {
                    popup: `toast-${type}`
                },
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer)
                    toast.addEventListener('mouseleave', Swal.resumeTimer)
                }
            });

            Toast.fire({
                icon: type,
                title: message
            });
        },
        success: (message, timer) => CustomSwal.toast.base(message, timer, 'success'),
        error: (message, timer) => CustomSwal.toast.base(message, timer, 'error'),
        warning: (message, timer) => CustomSwal.toast.base(message, timer, 'warning'),
        info: (message, timer) => CustomSwal.toast.base(message, timer, 'info')
    },

    popup: ({ title, message, type = 'info' }) => {
        return Swal.fire({
            title,
            text: message,
            icon: type,
            confirmButtonText: 'OK'
        });
    },

    confirm: async ({
        title = 'Confirm',
        message = 'Are you sure?',
        confirmButtonText = 'Yes',
        cancelButtonText = 'No',
        confirmButtonColor = '#3085d6',
        cancelButtonColor = '#d33'
    }) => {
        const result = await Swal.fire({
            title,
            text: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor,
            cancelButtonColor,
            confirmButtonText,
            cancelButtonText
        });
        return result.isConfirmed;
    }
};

export default CustomSwal;