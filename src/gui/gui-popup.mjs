import { EventDispatcher } from './gui-events';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import {
  getCyclewayColor,
  getCyclewayLabel,
  isTransitLink } from './gui-fastrack';

// toNext, toPrev: trigger functions for switching between multiple records
export function Popup(gui, toNext, toPrev) {
  var self = new EventDispatcher();
  var parent = gui.container.findChild('.mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  var content = El('div').addClass('popup-content').appendTo(el);
  // multi-hit display and navigation
  var tab = El('div').addClass('popup-tab').appendTo(el).hide();
  var nav = El('div').addClass('popup-nav').appendTo(tab);
  var prevLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('◀');
  var navInfo = El('span').addClass('popup-nav-info').appendTo(nav);
  var nextLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('▶');
  var refresh;

  el.addClass('rollover'); // used as a sentinel for the hover function

  nextLink.on('click', toNext);
  prevLink.on('click', toPrev);
  gui.on('popup-needs-refresh', function() {
    if (refresh) refresh();
  });

  self.show = function(id, ids, lyr, pinned, edit) {
    var singleEdit = edit || pinned && !internal.layerHasAttributeData(lyr);
    var multiEdit = pinned && gui.interaction.getMode() == 'selection';
    var maxHeight = parent.node().clientHeight - 36;

    // stash a function for refreshing the current popup when data changes
    // while the popup is being displayed (e.g. while dragging a label)
    // Info only: cycleway edits are made from the FASTrack shell's
    // selection bar, so the popup never renders editable fields.
    refresh = function() {
      render(id, ids, lyr, pinned, false);
    };
    refresh();
    if (multiEdit) {
      showRecords(ids.length);
    } else if (ids && ids.length > 1 && !multiEdit) {
      showNav(id, ids, pinned);
    } else {
      tab.hide();
    }
    el.show();
    if (content.node().clientHeight > maxHeight) {
      content.css('height:' + maxHeight + 'px');
    }
  };

  self.hide = function() {
    if (!isOpen()) return;
    refresh = null;
    // make sure any pending edits are made before re-rendering popup
    GUI.blurActiveElement(); // this should be more selective -- could cause a glitch if typing in console
    content.empty();
    content.node().removeAttribute('style'); // remove inline height
    el.hide();
  };

  return self;

  function isOpen() {
    return el.visible();
  }

  function showRecords(n) {
    navInfo.text(n);
    nextLink.css('display','none');
    prevLink.css('display','none');
    tab.show();
  }

  function showNav(id, ids, pinned) {
    var num = ids.indexOf(id) + 1;
    navInfo.text(' ' + num + ' / ' + ids.length + ' ');
    nextLink.css('display', pinned ? 'inline-block' : 'none');
    prevLink.css('display', pinned && ids.length > 2 ? 'inline-block' : 'none');
    tab.show();
  }

  function render(id, ids, lyr, pinned, editable) {
    var recIds = id >= 0 ? [id] : ids;
    var el = content;
    var table = lyr.data; // table can be null (e.g. if layer has no attribute data)

    if (editable && table) {
      var rec = recIds.length == 1 ? table.getRecordAt(recIds[0]) : getMultiRecord(recIds, table);
      if (rec && (rec.highway == 'train' || rec.highway == 'bus')) {
        editable = false;
      }
    }

    var tableEl = table ? renderTable(recIds, table, editable) : null;
    el.empty(); // clean up if panel is already open
    if (tableEl) {
      tableEl.appendTo(el);
      tableEl.on('copy', function(e) {
        // remove leading or trailing tabs that sometimes get copied when
        // selecting from a table
        var pasted = window.getSelection().toString();
        var cleaned = pasted.replace(/^\t/, '').replace(/\t$/, '');
        if (pasted != cleaned && !window.clipboardData) { // ignore ie
          (e.clipboardData || e.originalEvent.clipboardData).setData("text", cleaned);
          e.preventDefault(); // don't copy original string with tabs
        }
      });
    } else {
      // Some individual features can have undefined values for some or all of
      // their data properties (properties are set to undefined when an input JSON file
      // has inconsistent fields, or after force-merging layers with inconsistent fields).
      el.html(utils.format('<div class="note">This %s is missing attribute data.</div>',
          table && table.getFields().length > 0 ? 'feature': 'layer'));
    }
  }

  function renderTable(recIds, table, editable) {
    var tableEl = El('table').addClass('selectable');
    var rows = 0;
    var rec;
    if (recIds.length == 1) {
      rec = editable ?
        table.getReadOnlyRecordAt(recIds[0]) :
        table.getRecordAt(recIds[0]);
    } else {
      rec = getMultiRecord(recIds, table);
    }
    rec = rec || {};
    // Curated for planners: drop internal ids/coordinates and fields that
    // are unpopulated in practice (adt, slope_pct are null on every link),
    // keep only what's meaningful when reviewing/editing a link.
    var fieldsToShow = ['cycleway', 'highway', 'lvl_traf_s', 'length', 'freespeed', 'permlanes'];
    
    fieldsToShow.forEach(function(key) {
        if (key in rec) {
            var rowEl = renderRow(key, rec[key], recIds, table, editable);
            if (rowEl) {
                rowEl.appendTo(tableEl);
                rows++;
            }
        }
    });

    return rows > 0 ? tableEl : null;
  }

  function getMultiRecord(recIds, table) {
    var fields = table.getFields();
    var rec = {};
    recIds.forEach(function(id) {
      var d = table.getRecordAt(id) || {};
      var k, v;
      for (var i=0; i<fields.length; i++) {
        k = fields[i];
        v = d[k];
        if (k in rec === false) {
          rec[k] = v;
        } else if (rec[k] !== v) {
          rec[k] = null;
        }
      }
    });
    return rec;
  }


// Planner-friendly labels and units for the fields in fieldsToShow, so the
    // popup reads like a briefing instead of a raw data dump. Inlined as a
    // switch (no external lookup object) and defensively try/caught below --
    // this runs on every hover/selection in the map, so a labeling hiccup
    // must never be able to crash that interaction.
    function getFieldLabel(key) {
      try {
        switch (key) {
          case 'cycleway': return 'Cycling Infrastructure';
          case 'highway': return 'Road Type';
          case 'lvl_traf_s': return 'Traffic Stress (LTS)';
          case 'length': return 'Length';
          case 'freespeed': return 'Speed Limit';
          case 'permlanes': return 'Lanes';
          default: return key;
        }
      } catch (e) {
        return key;
      }
    }

    function getDisplayValue(key, val, str) {
      try {
        if (key === 'length' && typeof val === 'number') {
          return Math.round(val) + ' m';
        }
        if (key === 'freespeed' && typeof val === 'number') {
          return Math.round(val * 3.6) + ' km/h'; // network stores free-flow speed in m/s
        }
        if (key === 'cycleway') {
          return getCyclewayLabel(val);
        }
        return str;
      } catch (e) {
        return str;
      }
    }

    function renderRow(key, val, recIds, table, editable) {
      var type = getFieldType(val, key, table);
      var str = formatInspectorValue(val, type);
      var label = getFieldLabel(key);

      // A multi-selection whose values differ arrives here as null.
      var displayStr = val === null && recIds.length > 1 ? 'Varies' : getDisplayValue(key, val, str);
      var rowHtml = `<td class="field-name">${utils.htmlEscape(label)}</td><td><span class="value">${utils.htmlEscape(displayStr)}</span> </td>`;
      var rowEl = El('tr').html(rowHtml);
      var cellEl = rowEl.findChild('.value');

      setFieldClass(cellEl, val, type);
      return rowEl;
    }

  function setFieldClass(el, val, type) {
    var isNum = type ? type == 'number' : utils.isNumber(val);
    var isNully = val === undefined || val === null || val !== val;
    var isEmpty = val === '';
    el.classed('num-field', isNum);
    el.classed('object-field', type == 'object');
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, key, val, recIds, table, type) {
    // Skip creating text input for cycleway field since we're using dropdown
    if (key === 'cycleway') {
      return;
    }

    var input = new ClickText2(el),
        strval = formatInspectorValue(val, type),
        parser = internal.getInputParser(type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var val2 = parser(input.value()),
          strval2 = formatInspectorValue(val2, type);
      if (val2 === null && type != 'object') { // allow null objects
        // invalid value; revert to previous value
        input.value(strval);
      } else if (strval != strval2) {
        // field content has changed
        strval = strval2;
        gui.dispatchEvent('data_preupdate', {ids: recIds}); // for undo/redo
        // rec[key] = val2;
        updateRecords(recIds, key, val2, table);
        gui.dispatchEvent('data_postupdate', {ids: recIds});
        input.value(strval);
        setFieldClass(el, val2, type);
        self.dispatchEvent('data_updated', {field: key, value: val2, ids: recIds});
      }
    });
  }
}

function updateRecords(ids, f, v, table) {
  var records = table.getRecords();
  ids.forEach(function(id) {
    var d = records[id] || {};
    // Skip updating if highway is bus or train
    if (isTransitLink(d)) {
      return;
    }
    d[f] = v;
    records[id] = d;
  });
}

// Recolours edited links and copies the edit onto the link running the
// other way along the same street (links are one-directional).
export function applyCyclewayStyle(gui, ids, value) {
  var colour = getCyclewayColor(value);
  if (!colour) return;
  var active = gui.model.getActiveLayer();
  var layer = active && active.layer;
  if (!layer || !layer.data) return;
  var records = layer.data.getRecords();
  var shapes = layer.shapes;
  var idsToUpdate = new Set(ids);

  // Helper to identify topologically equivalent shapes
  var getShapeKey = function(shape) {
    if (!shape || !shape.length) return null;
    if (Array.isArray(shape[0]) && typeof shape[0][0] === 'number') {
      var arcs = [];
      for (var i=0; i<shape.length; i++) {
        for (var j=0; j<shape[i].length; j++) {
          var id = shape[i][j];
          arcs.push(id < 0 ? ~id : id);
        }
      }
      return arcs.sort(function(a, b) { return a - b; }).join(',');
    }
    return null;
  };

  if (shapes) {
    var targetKeys = [];
    ids.forEach(function(id) {
      var key = getShapeKey(shapes[id]);
      if (key) targetKeys.push(key);
    });

    if (targetKeys.length > 0) {
      for (var i=0; i<shapes.length; i++) {
        if (idsToUpdate.has(i)) continue;
        var key = getShapeKey(shapes[i]);
        if (key && targetKeys.includes(key)) {
          if (isTransitLink(records[i])) {
            continue;
          }
          idsToUpdate.add(i);
        }
      }
    }
  }

  var allIds = Array.from(idsToUpdate);
  allIds.forEach(function(id) {
    if (records[id]) {
      // Only apply colour if highway is not bus or train
      if (!isTransitLink(records[id])) {
        records[id].stroke = colour;
      }
      if (!ids.includes(id)) {
        records[id].cycleway = value;
      }
    }
  });

  gui.session.dataValueUpdated(ids, 'stroke', colour);

  var otherIds = allIds.filter(function(id) { return !ids.includes(id); });
  if (otherIds.length > 0) {
    gui.session.dataValueUpdated(otherIds, 'cycleway', value);
    gui.session.dataValueUpdated(otherIds, 'stroke', colour);
  }

  gui.dispatchEvent('map-needs-refresh');
}

// Lets the FASTrack shell change links' cycleway type (e.g. to revert an
// edit from its edits list) the same way the popup does.
export function setCyclewayFromShell(gui, ids, value) {
  var active = gui.model.getActiveLayer();
  var layer = active && active.layer;
  if (!layer || !layer.data || !ids.length) return;
  gui.dispatchEvent('data_preupdate', {ids: ids});
  updateRecords(ids, 'cycleway', value, layer.data);
  gui.dispatchEvent('data_postupdate', {ids: ids});
  gui.session.dataValueUpdated(ids, 'cycleway', value);
  applyCyclewayStyle(gui, ids, value);
  gui.dispatchEvent('fastrack_edits_changed');
}

function formatInspectorValue(val, type) {
  var str;
  if (type == 'date') {
    str = utils.formatDateISO(val);
  } else if (type == 'object') {
    str = val ? JSON.stringify(val) : "";
  } else {
    str = String(val);
  }
  return str;
}


function getFieldType(val, key, table) {
  // if a field has a null value, look at entire column to identify type
  return internal.getValueType(val) || internal.getColumnType(key, table.getRecords()) ;
}
