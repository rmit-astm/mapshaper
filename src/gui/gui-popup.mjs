import { EventDispatcher } from './gui-events';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import { openAddFieldPopup } from './gui-add-field-popup';

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
    refresh = function() {
      render(id, ids, lyr, pinned, singleEdit || multiEdit);
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

    var footer = El('div').appendTo(el);
    if (editable) {
      // render "add field" button
      El('span').addClass('add-field-btn').appendTo(footer).on('click', async function(e) {
        // show "add field" dialog
        openAddFieldPopup(gui, recIds, lyr);
      })//.text('+ add field');
    } else if (pinned) {
      // render "Click to edit" button
      El('span').addClass('edit-data-btn').appendTo(footer).on('click', async function(e) {
        self.show(id, ids, lyr, true, true);
      }).text('▸ click to edit');
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
          case 'cycleway': return 'Cycleway Type';
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
        if (key === 'cycleway' && !val) {
          return 'No Cycleway';
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

      if (editable && key === 'cycleway') {
        // Create dropdown for cycleway field
        var dropdownOptions = [
          {value: '', label: 'No Cycleway'},
        {value: 'bikepath', label: 'bikepath'},
        {value: 'shared_path', label: 'shared_path'},
        {value: 'separated_lane', label: 'separated_lane'},
        {value: 'simple_lane', label: 'simple_lane'},
        {value: 'inadequate_lane', label: 'inadequate_lane'},
        {value: 'shared_street', label: 'shared_street'}
      ];
      
      var optionsHtml = dropdownOptions.map(function(option) {
        var selected = val === option.value ? ' selected' : '';
        return `<option value="${utils.htmlEscape(option.value)}"${selected}>${utils.htmlEscape(option.label)}</option>`;
      }).join('');
      
      var rowHtml = `<td class="field-name">${utils.htmlEscape(label)}</td><td><select class="cycleway-dropdown value">${optionsHtml}</select></td>`;
      var rowEl = El('tr').html(rowHtml);
      var cellEl = rowEl.findChild('.value');
      
      // Add event listener for dropdown changes
      cellEl.on('change', function(e) {
        var newValue = cellEl.node().value;
        gui.dispatchEvent('data_preupdate', {ids: recIds});
        updateRecords(recIds, key, newValue, table);
        gui.dispatchEvent('data_postupdate', {ids: recIds});
        self.dispatchEvent('data_updated', {field: key, value: newValue, ids: recIds});
      });
      setFieldClass(cellEl, val, type);
      return rowEl;
      
    } else {
      // All other fields or non-editable cycleway
      var displayStr = getDisplayValue(key, val, str);
      var rowHtml = `<td class="field-name">${utils.htmlEscape(label)}</td><td><span class="value">${utils.htmlEscape(displayStr)}</span> </td>`;
      var rowEl = El('tr').html(rowHtml);
      var cellEl = rowEl.findChild('.value');
      
      setFieldClass(cellEl, val, type);
      return rowEl;
    }
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
    if (d.highway == 'bus' || d.highway == 'train') {
      return;
    }
    d[f] = v;
    records[id] = d;
  });
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
