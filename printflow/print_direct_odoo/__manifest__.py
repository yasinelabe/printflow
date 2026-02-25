{
    'name': 'Odoo Direct Print',
    'version': '18.0.1.0.0',
    'category': 'Extra Tools',
    'summary': '''Print POS receipts, invoices, reports, and labels directly to local, Bluetooth, Wi-Fi, and thermal printers without downloads, subscriptions, or cloud services. Easy desktop agent installation supports ESC/POS format, multiple printers, offline queuing, and automatic printing for restaurants, retail, and warehouses. Keywords: Odoo Direct Print | POS Direct Print | Local Printer Agent | Bluetooth Printer | Thermal Printer Odoo | ESC/POS Print | Print Without Download | Desktop Print Agent | Multi-Printer POS | Offline Print Queue | IoTBox Alternative | Subscription-Free | Auto Print POS | Kitchen Printer | Receipt Printer | Wi-Fi Printer Integration | Odoo Print Module | Print Directly from Odoo | Odoo Printing Solution | Network Printer | USB Printer | Zebra Printer | Print Automation | Direct Print Solution | Quick Print | Instant Print | Fast Printing | Seamless Print | One-Click Print | Print Agent | Local Print Server | Backend Printing | Invoice Print | Label Print | Barcode Print | Report Print | Document Print | Order Print | Ticket Print | Restaurant Printer | Retail Printer | Bar Printer | Warehouse Printer | Shipping Label Print | Print Without Pop-ups | Automatic Printing | Print Integration | Printer Connection | Remote Printing | Mobile Printing | Tablet Printing | Android Print | Print from POS | Print from Backend | ERP Printing Solution | Point of Sale Print | POS Print Integration | Cloud-Free Print | Privacy Print | Secure Printing | PrintNode Alternative | Smart Print Solution | All-in-One Print | Print Management | Business Printing | Commercial Printing | 58mm Thermal | 80mm Thermal | Custom Paper Size | Print Template | PDF Print Alternative | Direct Print Pro | Multi-Location Print | Kitchen Display | Front Desk Print | Cashier Print | Service Ticket Print | Delivery Order Print | Packing Slip Print | Work Order Print | Sales Receipt | Product Label | Guest Receipt | Booking Print | Print Workflow | Print Routing | Print POS Receipts & Tickets | POS Local Print | POS Direct Print Restaurant | Kitchen Orders Printing POS | POS Print Without Configuration | Plug & Play POS Print | Print from Android POS | Print from iOS POS | Mobile POS Printing | Fast Kitchen Printing | Remote POS Print | | Restaurant POS | Retail POS | Hospitality Print | Food Service Print | Quick Service | Full Service | Cafe Print | Hotel Print | Shop Print | Store Print | POS Printer | POS Print | POS Receipt Print | POS Order Print | POS Ticket Print | Direct POS Print | Print POS Receipts | POS Kitchen Printer''',
    'author': 'MateusC7',
    'website': 'https://mateusc7.github.io/',
    'depends': ['base', 'web', 'point_of_sale', 'pos_restaurant'],
    'data': [
        'views/ir_actions_report_views.xml',
        'views/pos_printer_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'print_direct_odoo/static/src/js/report_service_patch.js',
        ],
        'point_of_sale._assets_pos': [
            'print_direct_odoo/static/src/js/pos_printer_patch.js',
        ],
    },
    'images': [
        'static/description/banner.gif',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'price': 75.00,
    'currency': 'USD',
    'license': 'OPL-1',
}
