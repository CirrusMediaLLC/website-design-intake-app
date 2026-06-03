<?php
/**
 * Plugin Name: Cirrus Elementor Design Guide Connector
 * Description: Receives Cirrus design guide exports and safely stores or applies Elementor global colors/fonts.
 * Version: 0.1.0
 * Author: Cirrus Local
 */

if (!defined('ABSPATH')) {
  exit;
}

add_action('rest_api_init', function () {
  register_rest_route('cirrus/v1', '/design-guide', array(
    'methods' => 'POST',
    'callback' => 'cirrus_receive_design_guide',
    'permission_callback' => 'cirrus_design_guide_permission',
  ));
});

function cirrus_design_guide_permission($request) {
  $expected = getenv('CIRRUS_IMPORT_TOKEN');
  if (!$expected && defined('CIRRUS_IMPORT_TOKEN')) {
    $expected = CIRRUS_IMPORT_TOKEN;
  }
  if (!$expected) {
    return new WP_Error('cirrus_missing_token', 'CIRRUS_IMPORT_TOKEN is not configured on this WordPress site.', array('status' => 500));
  }
  $provided = $request->get_header('x-cirrus-token');
  if (!$provided) {
    $auth = $request->get_header('authorization');
    if (stripos($auth, 'bearer ') === 0) {
      $provided = trim(substr($auth, 7));
    }
  }
  return hash_equals($expected, (string) $provided);
}

function cirrus_receive_design_guide($request) {
  $payload = $request->get_json_params();
  if (!$payload || empty($payload['schema']) || $payload['schema'] !== 'cirrus.elementorExport') {
    return new WP_Error('cirrus_invalid_payload', 'Expected a cirrus.elementorExport payload.', array('status' => 400));
  }

  $mode = isset($payload['target']['mode']) ? sanitize_text_field($payload['target']['mode']) : 'dryRun';
  update_option('cirrus_latest_design_guide_payload', $payload, false);

  if ($mode === 'dryRun') {
    return array(
      'message' => 'Payload validated and stored. No Elementor settings changed.',
      'mode' => $mode,
      'summary' => cirrus_payload_summary($payload),
    );
  }

  if ($mode === 'storePreset') {
    cirrus_store_named_preset($payload);
    return array(
      'message' => 'Design guide preset stored for review.',
      'mode' => $mode,
      'summary' => cirrus_payload_summary($payload),
    );
  }

  if ($mode !== 'applyGlobals') {
    return new WP_Error('cirrus_unknown_mode', 'Unknown Elementor import mode.', array('status' => 400));
  }

  $kit_id = cirrus_active_elementor_kit_id();
  if (!$kit_id) {
    return new WP_Error('cirrus_no_kit', 'No active Elementor Kit was found.', array('status' => 500));
  }

  $settings = get_post_meta($kit_id, '_elementor_page_settings', true);
  if (!is_array($settings)) {
    $settings = array();
  }

  $settings['system_colors'] = cirrus_system_colors($payload);
  $settings['custom_colors'] = cirrus_custom_colors($payload);
  $settings['system_typography'] = cirrus_system_typography($payload);
  $settings['custom_typography'] = cirrus_custom_typography($payload);

  update_post_meta($kit_id, '_elementor_page_settings', $settings);
  cirrus_clear_elementor_cache();

  return array(
    'message' => 'Elementor global colors and typography updated.',
    'mode' => $mode,
    'kitId' => $kit_id,
    'summary' => cirrus_payload_summary($payload),
  );
}

function cirrus_active_elementor_kit_id() {
  if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->kits_manager)) {
    $kit = \Elementor\Plugin::$instance->kits_manager->get_active_kit();
    if ($kit && method_exists($kit, 'get_id')) {
      return $kit->get_id();
    }
  }
  $kit_id = get_option('elementor_active_kit');
  return $kit_id ? absint($kit_id) : 0;
}

function cirrus_system_colors($payload) {
  $colors = isset($payload['kit']['systemColors']) && is_array($payload['kit']['systemColors']) ? $payload['kit']['systemColors'] : array();
  $defaults = array('primary' => '#1267FF', 'secondary' => '#111827', 'text' => '#111827', 'accent' => '#1267FF');
  $rows = array();
  foreach ($defaults as $id => $fallback) {
    $color = isset($colors[$id]['color']) ? sanitize_hex_color($colors[$id]['color']) : $fallback;
    $title = isset($colors[$id]['title']) ? sanitize_text_field($colors[$id]['title']) : ucfirst($id);
    $rows[] = array('_id' => $id, 'title' => $title, 'color' => $color ?: $fallback);
  }
  return $rows;
}

function cirrus_custom_colors($payload) {
  $colors = isset($payload['kit']['customColors']) && is_array($payload['kit']['customColors']) ? $payload['kit']['customColors'] : array();
  $rows = array();
  foreach ($colors as $color) {
    $hex = isset($color['color']) ? sanitize_hex_color($color['color']) : '';
    if (!$hex) {
      continue;
    }
    $rows[] = array(
      '_id' => sanitize_key($color['id'] ?? wp_generate_uuid4()),
      'title' => sanitize_text_field($color['title'] ?? 'Custom Color'),
      'color' => $hex,
    );
  }
  return $rows;
}

function cirrus_system_typography($payload) {
  $types = isset($payload['kit']['systemTypography']) && is_array($payload['kit']['systemTypography']) ? $payload['kit']['systemTypography'] : array();
  $defaults = array('primary', 'secondary', 'text', 'accent');
  $rows = array();
  foreach ($defaults as $id) {
    $type = isset($types[$id]) ? $types[$id] : array();
    $rows[] = cirrus_typography_row($id, $type, ucfirst($id));
  }
  return $rows;
}

function cirrus_custom_typography($payload) {
  $types = isset($payload['kit']['customTypography']) && is_array($payload['kit']['customTypography']) ? $payload['kit']['customTypography'] : array();
  $rows = array();
  foreach ($types as $type) {
    $rows[] = cirrus_typography_row($type['id'] ?? wp_generate_uuid4(), $type, $type['title'] ?? 'Custom Type');
  }
  return $rows;
}

function cirrus_typography_row($id, $type, $fallback_title) {
  return array(
    '_id' => sanitize_key($id),
    'title' => sanitize_text_field($type['title'] ?? $fallback_title),
    'typography_typography' => 'custom',
    'typography_font_family' => sanitize_text_field($type['typography_font_family'] ?? 'Inter'),
    'typography_font_weight' => sanitize_text_field($type['typography_font_weight'] ?? '400'),
    'typography_font_size' => array('unit' => 'px', 'size' => cirrus_px_number($type['typography_font_size'] ?? '16px')),
    'typography_line_height' => array('unit' => 'px', 'size' => cirrus_px_number($type['typography_line_height'] ?? '24px')),
    'typography_letter_spacing' => array('unit' => 'em', 'size' => cirrus_em_number($type['typography_letter_spacing'] ?? '0')),
  );
}

function cirrus_px_number($value) {
  return floatval(str_replace('px', '', (string) $value));
}

function cirrus_em_number($value) {
  return floatval(str_replace('em', '', (string) $value));
}

function cirrus_store_named_preset($payload) {
  $presets = get_option('cirrus_design_guide_presets', array());
  if (!is_array($presets)) {
    $presets = array();
  }
  $name = sanitize_text_field($payload['project']['displayName'] ?? ('Preset ' . current_time('mysql')));
  $presets[$name] = $payload;
  update_option('cirrus_design_guide_presets', $presets, false);
}

function cirrus_payload_summary($payload) {
  return array(
    'systemColors' => count($payload['kit']['systemColors'] ?? array()),
    'customColors' => count($payload['kit']['customColors'] ?? array()),
    'systemTypography' => count($payload['kit']['systemTypography'] ?? array()),
    'customTypography' => count($payload['kit']['customTypography'] ?? array()),
    'spacingRules' => count($payload['kit']['spacingTokens']['rules'] ?? array()),
    'formFields' => count($payload['kit']['formTokens']['fields'] ?? array()),
  );
}

function cirrus_clear_elementor_cache() {
  if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
    \Elementor\Plugin::$instance->files_manager->clear_cache();
  }
}
