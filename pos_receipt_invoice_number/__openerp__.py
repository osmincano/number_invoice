# -*- coding: utf-8 -*-
{
    'name': "POS Receipt Show Invoice Number",
    'version': '8.0.1.0.1',
    'category': 'Point of Sale',
    'author': ['TL Technology'],
    'sequence': 0,
    'depends': [
        'point_of_sale'
    ],
    'data': [
        'template/import_library.xml',
        'views/pos_config.xml',
    ],
    'qweb': [
        'static/src/xml/*.xml'
    ],
    "external_dependencies": {
        "python": [],
        "bin": []
    },
    'images': ['static/description/icon.png'],
    'installable': True,
    'application': True,
}
