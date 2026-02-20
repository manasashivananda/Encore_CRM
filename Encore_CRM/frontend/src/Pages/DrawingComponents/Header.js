import { GetDayFromDate } from '../Common/Components';
import '../../styles/SelectMaterialsSimplified.scss';

export const DesignHeader = ({ customerName, orderNumber, orderDetails }) => {
    return (
        <div className="page-header">
            <div className="header-left">
                <h3>{customerName} - {orderNumber}</h3>
            </div>
            <div className="header-center">
                <p>Delivery Date {orderDetails?.order_delivery_date || orderDetails?.quote_delivery_date_str || 'Loading...'}</p>
            </div>
            <div className="header-right">
                <h3>
                {orderDetails ? (
                    <GetDayFromDate deliveryDate={orderDetails.order_delivery_date || orderDetails.quote_delivery_date_str} />
                ) : (
                    'Loading...'
                )}
                </h3>
            </div>
        </div>
    )
}