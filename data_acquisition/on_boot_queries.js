const queries = {
  GE_CT: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	ac.debian_server_path,
	sites.time_zone_id,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'GE'
	AND sys.modality LIKE '%CT'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
  GE_CV: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'system_id',
			log.system_id,
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'GE'
	AND sys.modality = 'CV/IR'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
  GE_MRI: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'GE'
	AND sys.modality = 'MRI'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
    `,
  PHILIPS_CT: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality LIKE '%CT'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
    `,
  PHILIPS_CV: `
    SELECT
	  sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'CV/IR'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
    `,
  PHILIPS_MRI_MONITOR_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 1
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id,
	ac.debian_server_path;
      `,
  PHILIPS_MRI_MONITOR_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 2
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
  PHILIPS_MRI_MONITOR_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 3
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
  PHILIPS_MRI_MONITOR_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 4
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
  PHILIPS_MRI_MONITOR_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 5
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_RMMU_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 1
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_RMMU_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 2
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_RMMU_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 3
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;`,
  PHILIPS_MRI_RMMU_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 4
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;              
 `,
  PHILIPS_MRI_RMMU_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 5
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;                                  
 `,
  PHILIPS_MRI_LOG_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_LOG_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 2
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_LOG_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 3
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_LOG_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 4
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
  PHILIPS_MRI_LOG_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 5
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
  SIEMENS_CT: `
  SELECT
	sys.id,
    sys.manufacturer,
    sys.modality,
    sites.time_zone_id,
    ac.debian_server_path,
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables,
			'file_version',
			ac.file_version
		) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Siemens'
	AND sys.modality LIKE '%CT'
	AND ac.run_group = 1
GROUP BY
  sys.id,
  sys.manufacturer,
  sys.modality,
  ac.system_id,
  log.file_name,
  log.dir_name,
  log.regex_models,
  log.pg_tables,
  ac.file_version,
  ac.debian_server_path,
  sites.time_zone_id;
    `,
  SIEMENS_MRI: `
    SELECT
    sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
        json_build_object(
            'file_name',
            log.file_name,
            'dir_name',
            log.dir_name,
            'parsers',
            log.regex_models,
            'pg_tables',
            log.pg_tables,
            'file_version',
            ac.file_version
        ) AS log_config
  FROM
    systems sys
    JOIN config.acquisition ac ON ac.system_id = sys.id
    JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
  WHERE
    sys.manufacturer = 'Siemens'
    AND sys.modality = 'MRI'
    AND ac.run_group = 1
  GROUP BY
    sys.id,
    ac.system_id,
    log.file_name,
    log.dir_name,
    log.regex_models,
    log.pg_tables,
    ac.file_version,
	sites.time_zone_id;
    `,
  SIEMENS_CV: `
    SELECT
    sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
        json_build_object(
            'file_name',
            log.file_name,
            'dir_name',
            log.dir_name,
            'parsers',
            log.regex_models,
            'pg_tables',
            log.pg_tables,
            'file_version',
            ac.file_version
        ) AS log_config
  FROM
    systems sys
    JOIN config.acquisition ac ON ac.system_id = sys.id
    JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
  WHERE
    sys.manufacturer = 'Siemens'
    AND sys.modality = 'CV/IR'
    AND ac.run_group = 1
  GROUP BY
    sys.id,
    ac.system_id,
    log.file_name,
    log.dir_name,
    log.regex_models,
    log.pg_tables,
    ac.file_version,
	sites.time_zone_id;
    `
};

module.exports = queries;

/*  OLD

const queries = {
      GE_CT:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT null AND manufacturer = 'GE' AND modality LIKE '%CT' AND hhm_config->'run_group' = '1'",
      GE_CV:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND manufacturer = 'GE' AND modality = 'CV/IR' AND hhm_config->'run_group' = '1'",
      GE_MRI:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND manufacturer = 'GE' AND modality = 'MRI' AND hhm_config->'run_group' = '1'",
      PHILIPS_CT:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND manufacturer = 'Philips' AND modality LIKE '%CT' AND hhm_config->'run_group' = '1'",
      PHILIPS_CV:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'CV/IR' AND manufacturer = 'Philips' AND hhm_config->'run_group' = '2'",
      PHILIPS_MRI_1:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'MRI' AND hhm_config->'run_group' = '1' AND manufacturer = 'Philips'",
      PHILIPS_MRI_2:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'MRI' AND hhm_config->'run_group' = '2' AND manufacturer = 'Philips'",
      PHILIPS_MRI_3:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'MRI' AND hhm_config->'run_group' = '3' AND manufacturer = 'Philips'",
      PHILIPS_MRI_4:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'MRI' AND hhm_config->'run_group' = '4' AND manufacturer = 'Philips'",
      PHILIPS_MRI_5:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND modality = 'MRI' AND hhm_config->'run_group' = '5' AND manufacturer = 'Philips'",
      SIEMENS_CT:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND manufacturer = 'Siemens' AND modality LIKE '%CT' AND hhm_config->'run_group' = '1'",
      SIEMENS_MRI:
        "SELECT id, manufacturer, hhm_config, hhm_file_config from systems WHERE hhm_config IS NOT NULL AND manufacturer = 'Siemens' AND modality = 'MRI' AND hhm_config->'run_group' = '1'",
      NORM_MAG: `
      SELECT pc.*, 
      json_agg(json_build_object(
        'system_id', pc.system_id,
        'dir_name', mag.dir_name,
          'file_name', mag.file_name,
          'parser', mag.regex_models,
          'pg_tables', mag.pg_tables,
          'column_name', mag.column_name,
          'agg', mag.agg
      )) AS mag_data,
      jsonb_build_object(
        'host_ip', ac.host_ip,
        'mmb_ip', ac.mmb_ip,
        'protocal', ac.protocal,
        'debian_server_path', ac.debian_server_path,
        'credentials_group', ac.credentials_group,
        'acquisition_script', ac.acquisition_script,
        'run_group', ac.run_group,
        'host', ac.host,
        'user_id', ac.user_id
      ) AS acqu_config
      FROM config.process_config pc
      JOIN config.acquisition ac ON ac.system_id = pc.system_id
      JOIN config.mag mag ON mag.system_id = pc.system_id
      GROUP BY pc.system_id, ac.system_id;
      `,
      NORM_LOG: `
      SELECT pc.*, 
      jsonb_build_object(
        'host_ip', ac.host_ip,
        'mmb_ip', ac.mmb_ip,
        'protocal', ac.protocal,
        'debian_server_path', ac.debian_server_path,
        'credentials_group', ac.credentials_group,
        'acquisition_script', ac.acquisition_script,
        'run_group', ac.run_group,
        'host', ac.host,
        'user_id', ac.user_id
      ) AS acqu_config,
      json_agg(json_build_object(
        'system_id', log.system_id,
        'file_name', log.file_name,
        'dir_name', log.dir_name,
        'parsers', log.regex_models,
        'pg_tables', log.pg_tables
      )) AS log_config
      FROM config.process_config pc
      JOIN config.acquisition ac ON ac.system_id = pc.system_id
      JOIN config.log log ON log.system_id = pc.system_id
      GROUP BY pc.system_id, ac.system_id;
      `
    };
*/
