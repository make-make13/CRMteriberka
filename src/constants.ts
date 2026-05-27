/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ObjectDefinition, Settings } from './types';

export const CC_OBJECTS: ObjectDefinition[] = [
  { id: 'cc-1', name: '№1', category: 'Стандарт двухместный', capacity: 2, seaView: true, pricePerNight: 27000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-2', name: '№2', category: 'Джуниор сьют', capacity: 2, seaView: true, pricePerNight: 35000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-3', name: '№3', category: 'Джуниор сьют', capacity: 2, pricePerNight: 33000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-4', name: '№4', category: 'Стандарт двухместный', capacity: 2, pricePerNight: 25000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-5', name: '№5', category: 'Стандарт двухместный', capacity: 2, pricePerNight: 25000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-6', name: '№6', category: 'Джуниор сьют', capacity: 2, pricePerNight: 33000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-7', name: '№7', category: 'Стандарт одноместный', capacity: 1, pricePerNight: 17000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-8', name: '№8', category: 'Стандарт одноместный', capacity: 1, seaView: true, pricePerNight: 20000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-9', name: '№9', category: 'Стандарт двухместный', capacity: 2, seaView: true, pricePerNight: 27000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-10', name: '№10', category: 'Стандарт двухместный', capacity: 2, pricePerNight: 25000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-11', name: '№11', category: 'Стандарт двухместный', capacity: 2, pricePerNight: 25000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-12', name: '№12', category: 'Стандарт одноместный', capacity: 1, pricePerNight: 17000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-13', name: '№13', category: 'Стандарт одноместный', capacity: 1, seaView: true, pricePerNight: 20000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-14', name: '№14', category: 'Стандарт одноместный', capacity: 1, seaView: true, pricePerNight: 20000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-15', name: '№15', category: 'Стандарт двухместный', capacity: 2, seaView: true, pricePerNight: 27000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-16', name: '№16', category: 'Стандарт двухместный', capacity: 2, seaView: true, pricePerNight: 27000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-17', name: '№17', category: 'Джуниор сьют', capacity: 2, seaView: true, pricePerNight: 35000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-18', name: '№18', category: 'Джуниор сьют', capacity: 2, pricePerNight: 33000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-19', name: '№19', category: 'Стандарт двухместный', capacity: 2, pricePerNight: 25000, baseType: 'chunga-changa', type: 'house' },
  { id: 'cc-20', name: '№20', category: 'Апартаменты / VIP', capacity: 4, seaView: true, pricePerNight: 80000, baseType: 'chunga-changa', type: 'house' },
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
