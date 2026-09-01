Pod::Spec.new do |s|
  s.name           = 'NotifActions'
  s.version        = '0.1.0'
  s.summary        = 'Killed-app chat notification reply / mark-as-read'
  s.description    = 'Services the chat push notification Reply / Mark-as-read actions natively so they work while the app process is not running.'
  s.author         = ''
  s.homepage       = 'https://glosonline.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # NotificationCenterManager / NotificationDelegate live here — we register a
  # delegate to observe the notification-action response.
  s.dependency 'EXNotifications'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
