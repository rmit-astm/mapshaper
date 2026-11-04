import { Popup, applyCyclewayStyle } from './gui-popup';
import { EventDispatcher } from './gui-events';
import { internal } from './gui-core';
import { deleteFeature } from './gui-drawing-utils';

export function InspectionControl2(gui, hit) {
  var _popup = new Popup(gui, hit.getSwitchTrigger(1), hit.getSwitchTrigger(-1));
  var _self = new EventDispatcher();

  gui.on('interaction_mode_change', function(e) {
    if (!gui.interaction.modeUsesPopup(e.mode)) {
      inspect(-1); // clear the popup
    }
  });

  _popup.on('data_updated', function(e) {
    // data_change event no longer needed (update is handled below)
    // _self.dispatchEvent('data_change', e.data); // let map know which field has changed
    gui.session.dataValueUpdated(e.ids, e.field, e.value);

    if (e.field == 'cycleway') {
      applyCyclewayStyle(gui, e.ids, e.value);
      gui.dispatchEvent('fastrack_edits_changed');
    }

    // Refresh the display if a style variable has been changed interactively
    if (internal.isSupportedSvgStyleProperty(e.field)) {
      gui.dispatchEvent('map-needs-refresh');
    }
  });

  hit.on('contextmenu', function(e) {
    if (!e.overMap || e.mode == 'edit_lines' || e.mode == 'edit_polygons' ||
      e.mode == 'edit_points' || e.mode == 'snip_lines') {
      return;
    }
    var target = hit.getHitTarget();
    if (e.ids.length == 1) {
      e.deleteFeature = function() {
        deleteFeature(target, e.ids[0]);
        gui.model.updated({filter:true});
      };
    }
    gui.contextMenu.open(e, target);
  });

  // Tell the FASTrack shell which links are selected: the multi-selection,
  // or the one link pinned by clicking in Inspect mode.
  var _selectedKey = '';
  hit.on('change', function(e) {
    // In selection mode e.ids can include a hovered or highlighted link,
    // so read the actual selection.
    var selected = e.mode == 'selection' ? hit.getSelectionIds() : (e.pinned && e.id > -1 ? [e.id] : []);
    var key = selected.join(',');
    if (key != _selectedKey) {
      _selectedKey = key;
      gui.dispatchEvent('fastrack_selection_change', {ids: selected.concat()});
    }
  });
  window.__fastrackClearSelection = function() { hit.clearSelection(); };

  hit.on('change', function(e) {
    if (!inspecting()) return;
    if (gui.keyboard.ctrlIsPressed()) return;
    var ids = e.ids || [];
    inspect(e.mode == 'selection' ? -1 : e.id, ids, e.mode == 'selection' || e.pinned);
  });

  // id: Id of a feature in the active layer, or -1
  function inspect(id, ids, pin) {
    var target = hit.getHitTarget();
    if ((id > -1 || ids && ids.length > 0) && inspecting() && target && target) {
      _popup.show(id, ids, target, pin);
    } else {
      _popup.hide();
    }
  }

  // does the attribute inspector appear on rollover
  function inspecting() {
    return gui.interaction && gui.interaction.modeUsesPopup(gui.interaction.getMode());
  }

  return _self;
}
