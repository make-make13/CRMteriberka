/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ObjectDefinition, Settings } from './types';

export const CC_OBJECTS: ObjectDefinition[] = [
  { id: 'cc-1', name: 'ДОМ №1', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-2', name: 'ДОМ №2', capacity: 10, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-3', name: 'ДОМ №3', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-4', name: 'ДОМ №4', capacity: 30, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-6', name: 'ДОМ №6', capacity: 30, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-8', name: 'ДОМ №8', capacity: 30, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-9', name: 'ДОМ №9', capacity: 20, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-10', name: 'ДОМ №10', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-11', name: 'ДОМ №11', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-12', name: 'ДОМ №12', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-14', name: 'ДОМ №14', capacity: 15, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-15', name: 'ДОМ №15', capacity: 15, baseType: 'chunga-changa', type: 'house' },
];

export const GB_OBJECTS: ObjectDefinition[] = [
  { id: 'gb-1', name: 'КОТТЕДЖ №1', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-2', name: 'КОТТЕДЖ №2', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-3-1', name: 'КОТТЕДЖ №3/1', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-3-2', name: 'КОТТЕДЖ №3/2', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-3-3', name: 'КОТТЕДЖ №3/3', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-3-4', name: 'КОТТЕДЖ №3/4', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-3-5', name: 'КОТТЕДЖ №3/5', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-5-1', name: 'КОТТЕДЖ №5.1', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-5-2', name: 'КОТТЕДЖ №5.2', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-6-1', name: 'КОТТЕДЖ №6.1', baseType: 'golubaya-bukhta', type: 'cottage' },
  { id: 'gb-6-2', name: 'КОТТЕДЖ №6.2', baseType: 'golubaya-bukhta', type: 'cottage' },
];

export const GB_SERVICES: ObjectDefinition[] = [
  { id: 'gb-bath', name: 'Русская баня', baseType: 'golubaya-bukhta', type: 'service' },
  { id: 'gb-furako', name: 'Фурако', baseType: 'golubaya-bukhta', type: 'service' },
];

export const INITIAL_SETTINGS: Settings = {
  companyName: 'Большая Медведица',
  inn: '5105013870',
  address: '184433, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д.1А, помещение 34',
  phone: '(815-2) 99-44-21',
  vatRate: 0.05,
  emailForReports: '',
};
