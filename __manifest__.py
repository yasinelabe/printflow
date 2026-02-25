# -*- coding: utf-8 -*-
# Copyright 2024 Yasin Elabe
# License OPL-1 (Odoo Proprietary License v1.0)
{
    'name': 'PrintFlow - Direct Printing Solution',
    'version': '18.0.1.0.0',
    'category': 'Productivity/Printing',
    'summary': 'Direct local printing for POS, invoices, reports and labels - No IoT Box required',
    'description': """
PrintFlow - Professional Direct Printing for Odoo
==================================================

The complete printing solution for Odoo that connects directly to your local 
printers without requiring IoT Box, cloud services, or recurring subscriptions.

Features
--------
* Direct POS receipt printing to thermal printers
* Kitchen/preparation ticket routing by product category  
* Automatic invoice and report printing
* ZPL label printing for inventory and shipping
* Support for multiple printers per workstation
* Image and text-based thermal printing modes
* Individual agent configuration per POS terminal
* Comprehensive print job history and logging

Printer Compatibility
--------------------
* Thermal receipt printers (ESC/POS compatible)
* ZPL label printers (Zebra, TSC, SATO, etc.)
* Standard document printers (PDF-capable)
* Connection: USB, Ethernet, WiFi, Bluetooth

Technical Requirements
---------------------
* Odoo 18.0 (Community or Enterprise)
* PrintFlow Desktop Agent (Windows/Linux/macOS)

Author: Yasin Elabe
    """,
    'author': 'Yasin Elabe',
    'website': 'https://github.com/yasinelabe',
    'support': 'yasinelabe@gmail.com',
    'license': 'OPL-1',
    'price': 89.00,
    'currency': 'USD',
    'depends': [
        'base',
        'web', 
        'point_of_sale',
        'stock',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/ir_config_parameter_data.xml',
        'views/printflow_settings_views.xml',
        'views/pos_config_views.xml',
        'views/preparation_printer_views.xml',
        'views/report_config_views.xml',
        'views/print_history_views.xml',
        'views/menu_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'printflow/static/src/js/backend_print_handler.js',
            'printflow/static/src/js/settings_verify.js',
        ],
        'point_of_sale._assets_pos': [
            'printflow/static/lib/html2canvas.min.js',
            'printflow/static/src/js/pos_print_service.js',
        ],
    },
    'images': [
        'static/description/main_banner.png',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
